import "jest";
import {createFormattedMeasurements} from "../../../src";
import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import {default as loginSuccessResponse} from "../../data/login.json";
import {default as connectionsResponse} from "../../data/connections.json";
import {default as graphResponse} from "../../data/graph.json";
import {GraphData} from "../../../src/interfaces/librelink/graph-response";
import {Entry} from "../../../src/nightscout/interface";
import {Client as ClientV1} from "../../../src/nightscout/apiv1";
import {Client as ClientV3} from "../../../src/nightscout/apiv3";
import readConfig from "../../../src/config";

const mock = new MockAdapter(axios);

mock.onPost("https://api-eu.libreview.io/llu/auth/login").reply(200, loginSuccessResponse);
mock.onGet("https://api-eu.libreview.io/llu/connections").reply(200, connectionsResponse);
mock.onGet("https://api-eu.libreview.io/llu/connections/7ad66b40-ba9b-401e-9845-4f49f998cf16/graph").reply(200, graphResponse);
mock.onGet("http://localhost:1337/api/v1/entries?count=1").reply(200, []);
mock.onPost("http://localhost:1337/api/v1/entries").reply(200, []);

const FIXTURE_SERIAL = "ABCDEF1234";
const FIXTURE_ACTIVATION = 1671955478;

function cloneGraphData(): GraphData
{
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return JSON.parse(JSON.stringify(graphResponse.data)) as GraphData;
}

describe("Sensor info", () =>
{
    const env = process.env

    beforeAll(async () =>
    {
        // Let the single-shot main() triggered by the module import settle
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    beforeEach(() =>
    {
        jest.resetModules()
        process.env = {...env}
        delete process.env.SENSOR_INFO
    })

    afterEach(() =>
    {
        process.env = env
    })

    it("Entries do not include sensor info by default", async () =>
    {
        const formattedMeasurements: Entry[] = await createFormattedMeasurements(cloneGraphData());
        expect(formattedMeasurements.length).toBe(142);
        formattedMeasurements.forEach(entry =>
        {
            expect(entry).not.toHaveProperty("sensorInfo");
        });
    });

    it("Entries include serial number and activation time when SENSOR_INFO is enabled", async () =>
    {
        process.env.SENSOR_INFO = "true";
        const formattedMeasurements: Entry[] = await createFormattedMeasurements(cloneGraphData());
        expect(formattedMeasurements.length).toBe(142);
        formattedMeasurements.forEach(entry =>
        {
            expect(entry.sensorInfo).toEqual({
                serialNumber: FIXTURE_SERIAL,
                activationTimeEpoch: FIXTURE_ACTIVATION
            });
        });
    });

    it("Readings are matched to the sensor that was active at their time", async () =>
    {
        process.env.SENSOR_INFO = "true";
        const graphData = cloneGraphData();

        // Add a second sensor activated in the middle of the reading window
        const newSensorActivation = 1672400000;
        const newSensor = JSON.parse(JSON.stringify(graphData.activeSensors[0]));
        newSensor.sensor.sn = "NEWSENSOR1";
        newSensor.sensor.a = newSensorActivation;
        graphData.activeSensors.push(newSensor);
        graphData.connection.sensor.sn = "NEWSENSOR1";

        const formattedMeasurements: Entry[] = await createFormattedMeasurements(graphData);
        expect(formattedMeasurements.length).toBe(142);

        let oldSensorCount = 0;
        let newSensorCount = 0;
        formattedMeasurements.forEach(entry =>
        {
            const expectedSerial = entry.date.getTime() / 1000 >= newSensorActivation
                ? "NEWSENSOR1"
                : FIXTURE_SERIAL;
            expect(entry.sensorInfo?.serialNumber).toBe(expectedSerial);
            expect(entry.sensorInfo?.error).toBeUndefined();
            if (expectedSerial === FIXTURE_SERIAL)
            {
                oldSensorCount++;
            }
            else
            {
                newSensorCount++;
            }
        });

        // The window must actually span both sensors for this test to be meaningful
        expect(oldSensorCount).toBeGreaterThan(0);
        expect(newSensorCount).toBeGreaterThan(0);
    });

    it("Most recent reading reports an error if the connection sensor does not match the latest active sensor", async () =>
    {
        process.env.SENSOR_INFO = "true";
        const graphData = cloneGraphData();
        graphData.connection.sensor.sn = "MISMATCH99";

        const formattedMeasurements: Entry[] = await createFormattedMeasurements(graphData);
        expect(formattedMeasurements.length).toBe(142);

        // The most recent reading is validated against the connection sensor
        expect(formattedMeasurements[0].sensorInfo?.serialNumber).toBeUndefined();
        expect(formattedMeasurements[0].sensorInfo?.error).toContain("does not match");

        // Historical readings are still matched by activation time
        formattedMeasurements.slice(1).forEach(entry =>
        {
            expect(entry.sensorInfo?.serialNumber).toBe(FIXTURE_SERIAL);
        });
    });

    it("Readings before any sensor activation report an error but still upload", async () =>
    {
        process.env.SENSOR_INFO = "true";
        const graphData = cloneGraphData();
        // Move the activation after all readings in the fixture
        graphData.activeSensors[0].sensor.a = 1700000000;
        graphData.connection.sensor.a = 1700000000;

        const formattedMeasurements: Entry[] = await createFormattedMeasurements(graphData);
        expect(formattedMeasurements.length).toBe(142);
        formattedMeasurements.forEach(entry =>
        {
            expect(entry.sgv).toBeGreaterThan(0);
            expect(entry.sensorInfo?.serialNumber).toBeUndefined();
            expect(entry.sensorInfo?.error).toContain("No sensor found active");
        });
    });

    it("Missing active sensors report an error but still upload", async () =>
    {
        process.env.SENSOR_INFO = "true";
        const graphData = cloneGraphData();
        graphData.activeSensors = [];

        const formattedMeasurements: Entry[] = await createFormattedMeasurements(graphData);
        expect(formattedMeasurements.length).toBe(142);
        formattedMeasurements.forEach(entry =>
        {
            expect(entry.sgv).toBeGreaterThan(0);
            expect(entry.sensorInfo?.serialNumber).toBeUndefined();
            expect(entry.sensorInfo?.error).toBeDefined();
        });
    });

    it("Nightscout API v1 payload carries sensorInfo only when present on the entry", async () =>
    {
        const client = new ClientV1(readConfig());
        const entries: Entry[] = [
            {
                date: new Date(1672418860000),
                sgv: 987,
                sensorInfo: {serialNumber: FIXTURE_SERIAL, activationTimeEpoch: FIXTURE_ACTIVATION}
            },
            {
                date: new Date(1672418920000),
                sgv: 988
            }
        ];

        mock.resetHistory();
        await client.uploadEntries(entries);

        const uploadRequests = mock.history.post.filter(request => request.url === "http://localhost:1337/api/v1/entries");
        expect(uploadRequests.length).toBe(1);
        const payload = JSON.parse(uploadRequests[0].data);
        expect(payload.length).toBe(2);
        expect(payload[0].sgv).toBe(987);
        expect(payload[0].sensorInfo).toEqual({
            serialNumber: FIXTURE_SERIAL,
            activationTimeEpoch: FIXTURE_ACTIVATION
        });
        expect(payload[1].sgv).toBe(988);
        expect(payload[1]).not.toHaveProperty("sensorInfo");
    });

    it("Nightscout API v3 payload carries sensorInfo only when present on the entry", async () =>
    {
        mock.onGet("http://localhost:1337/api/v2/authorization/request/abcdefg").reply(200, {token: "test-jwt-token"});
        mock.onPost("http://localhost:1337/api/v3/entries").reply(201, {});

        const client = new ClientV3(readConfig());
        const entries: Entry[] = [
            {
                date: new Date(1672418860000),
                sgv: 987,
                sensorInfo: {serialNumber: FIXTURE_SERIAL, activationTimeEpoch: FIXTURE_ACTIVATION}
            },
            {
                date: new Date(1672418920000),
                sgv: 988
            }
        ];

        mock.resetHistory();
        await client.uploadEntries(entries);

        const uploadRequests = mock.history.post.filter(request => request.url === "http://localhost:1337/api/v3/entries");
        expect(uploadRequests.length).toBe(2);
        const payloads = uploadRequests.map(request => JSON.parse(request.data));
        const withSensor = payloads.find(payload => payload.sgv === 987);
        const withoutSensor = payloads.find(payload => payload.sgv === 988);
        expect(withSensor.sensorInfo).toEqual({
            serialNumber: FIXTURE_SERIAL,
            activationTimeEpoch: FIXTURE_ACTIVATION
        });
        expect(withoutSensor).not.toHaveProperty("sensorInfo");
    });
});
