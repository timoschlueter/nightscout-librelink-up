import "jest";
import {
    createFormattedMeasurements,
    getGlucoseMeasurements,
    getLibreLinkUpConnection,
    login,
} from "../../../src";
import axios from "axios";
import MockAdapter from "axios-mock-adapter";

const mock = new MockAdapter(axios);
import {default as loginSuccessResponse} from "../../data/login.json";
import {default as loginFailedResponse} from "../../data/login-failed.json";
import {default as connectionsResponse} from "../../data/connections.json";
import {default as entriesResponse} from "../../data/entries.json";
import {default as graphResponse} from "../../data/graph.json";
import {AuthTicket} from "../../../src/interfaces/librelink/common";
import {GraphData} from "../../../src/interfaces/librelink/graph-response";
import {Entry} from "../../../src/nightscout/interface";

mock.onPost("https://api-eu.libreview.io/llu/auth/login").reply(200, loginSuccessResponse);
mock.onGet("https://api-eu.libreview.io/llu/connections").reply(200, connectionsResponse);
mock.onGet("https://api-eu.libreview.io/llu/connections/7ad66b40-ba9b-401e-9845-4f49f998cf16/graph").reply(200, graphResponse);
mock.onGet("http://localhost:1337/api/v1/entries?count=1").reply(200, []);

describe("LibreLink Up", () =>
{
    const env = process.env

    beforeEach(() =>
    {
        jest.resetModules()
        process.env = {...env}
    })

    afterEach(() =>
    {
        process.env = env
    })

    it("Successful login to LibreLink Up", async () =>
    {
        const authTicket: AuthTicket | null = await login();
        expect(authTicket).not.toBeNull();
        expect(authTicket?.token).not.toBeNull();
        expect(authTicket?.expires).toBe(1687970889);
        expect(authTicket?.duration).toBe(15552000000);
    });

    it("Failed login to LibreLink Up", async () =>
    {
        mock.onPost("https://api-eu.libreview.io/llu/auth/login").reply(200, loginFailedResponse);

        const authTicket: AuthTicket | null = await login();
        expect(authTicket).toBeNull();
    });

    it("Get available connections - No specific patient-id", async () =>
    {
        const connectionId: string | null = await getLibreLinkUpConnection();
        expect(connectionId).toBe("7ad66b40-ba9b-401e-9845-4f49f998cf16");
    });

    it("Get available connections - Second available patient-id", async () =>
    {
        process.env.LINK_UP_CONNECTION = "77179667-ba4b-11eb-ad1f-0242ac110004";
        const connectionId: string | null = await getLibreLinkUpConnection();
        expect(connectionId).toBe("77179667-ba4b-11eb-ad1f-0242ac110004");
    });

    it("Get available connections - First available patient-id", async () =>
    {
        process.env.LINK_UP_CONNECTION = "7ad66b40-ba9b-401e-9845-4f49f998cf16";
        const connectionId: string | null = await getLibreLinkUpConnection();
        expect(connectionId).toBe("7ad66b40-ba9b-401e-9845-4f49f998cf16");
    });

    it("Get glucose measurements for a specific connection", async () =>
    {
        const glucoseMeasurements: GraphData | null = await getGlucoseMeasurements();
        expect(glucoseMeasurements?.connection.patientId).toBe("7ad66b40-ba9b-401e-9845-4f49f998cf16");
        expect(glucoseMeasurements?.connection.glucoseMeasurement.ValueInMgPerDl).toBe(115);
        expect(glucoseMeasurements?.graphData.length).toBe(141);
    });

    it("Convert all measurement data into Nightscout entries", async () =>
    {
        const glucoseMeasurements: GraphData | null = await getGlucoseMeasurements();
        expect(glucoseMeasurements?.graphData.length).toBe(141);
        expect(glucoseMeasurements).not.toBeNull();

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const formattedMeasurements: Entry[] = await createFormattedMeasurements(glucoseMeasurements);
        expect(formattedMeasurements.length).toBe(142);

        expect(formattedMeasurements[0].date.getTime()).toBe(1672418860000);
        expect(formattedMeasurements[0].direction).toBe("Flat");
        expect(formattedMeasurements[0].sgv).toBe(115);

        expect(formattedMeasurements[1].date.getTime()).toBe(1672375840000);
        expect(formattedMeasurements[1]).not.toHaveProperty("direction");
        expect(formattedMeasurements[1].sgv).toBe(173);
    });

    it("Convert missing measurement data into Nightscout entries", async () =>
    {
        mock.onGet("http://localhost:1337/api/v1/entries?count=1").reply(200, entriesResponse);
        const glucoseMeasurements: GraphData | null = await getGlucoseMeasurements();
        expect(glucoseMeasurements?.graphData.length).toBe(141);
        expect(glucoseMeasurements).not.toBeNull();

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const formattedMeasurements: Entry[] = await createFormattedMeasurements(glucoseMeasurements);
        expect(formattedMeasurements.length).toBe(112);

        expect(formattedMeasurements[0].date.getTime()).toBe(1672418860000);
        expect(formattedMeasurements[0].direction).toBe("Flat");
        expect(formattedMeasurements[0].sgv).toBe(115);

        expect(formattedMeasurements[1].date.getTime()).toBe(1672384839000);
        expect(formattedMeasurements[1]).not.toHaveProperty("direction");
        expect(formattedMeasurements[1].sgv).toBe(177);
    });
});
