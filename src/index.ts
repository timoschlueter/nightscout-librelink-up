/**
 * Nightscout LibreLink Up Uploader/Sidecar
 * Script written in TypeScript that uploads CGM readings from LibreLink Up to Nightscout.
 *
 * SPDX-License-Identifier: MIT
 */
import {LLU_API_ENDPOINTS} from "./constants/llu-api-endpoints";
import cron from "node-cron";
import axios from "axios";
import {createLogger, transports, format} from "winston";
import {LoginResponse} from "./interfaces/librelink/login-response";
import {ConnectionsResponse} from "./interfaces/librelink/connections-response";
import {GraphData, GraphResponse} from "./interfaces/librelink/graph-response";
import {AuthTicket, Connection, GlucoseItem} from "./interfaces/librelink/common";
import {getUtcDateFromString, mapTrendArrow} from "./helpers/helpers";
import {LibreLinkUpHttpHeaders, NightScoutHttpHeaders} from "./interfaces/http-headers";
import {Entry} from "./interfaces/nightscout/entry";

const {combine, timestamp, printf} = format;

const logFormat = printf(({level, message}) =>
{
    return `[${level}]: ${message}`;
});

const logger = createLogger({
    format: combine(
        timestamp(),
        logFormat
    ),
    transports: [
        new transports.Console({level: process.env.LOG_LEVEL || "info"}),
    ]
});

axios.interceptors.response.use(response =>
{
    return response;
}, error =>
{
    if (error.response)
    {
        logger.error(JSON.stringify(error.response.data));
    }
    else
    {
        logger.error(error.message);
    }
    return error;
});

const USER_AGENT = "FreeStyle LibreLink Up NightScout Uploader";

/**
 * LibreLink Up Credentials
 */
const LINK_UP_USERNAME = process.env.LINK_UP_USERNAME;
const LINK_UP_PASSWORD = process.env.LINK_UP_PASSWORD;

/**
 * LibreLink Up API Settings (Don't change this unless you know what you are doing)
 */
const LIBRE_LINK_UP_VERSION = "4.2.2";
const LIBRE_LINK_UP_PRODUCT = "llu.ios";
const LINK_UP_REGION = process.env.LINK_UP_REGION || "EU";
const LIBRE_LINK_UP_URL = getLibreLinkUpUrl(LINK_UP_REGION);

function getLibreLinkUpUrl(region: string): string
{
    if (LLU_API_ENDPOINTS.hasOwnProperty(region))
    {
        return LLU_API_ENDPOINTS[region];
    }
    return LLU_API_ENDPOINTS.EU;
}

/**
 * NightScout API
 */
const NIGHTSCOUT_URL = process.env.NIGHTSCOUT_URL;
const NIGHTSCOUT_API_TOKEN = process.env.NIGHTSCOUT_API_TOKEN;
const NIGHTSCOUT_DISABLE_HTTPS = process.env.NIGHTSCOUT_DISABLE_HTTPS || false;
const NIGHTSCOUT_DEVICE_NAME = process.env.DEVICE_NAME || "nightscout-librelink-up";

function getNightscoutUrl(): string
{
    if (NIGHTSCOUT_DISABLE_HTTPS === "true")
    {
        return "http://" + NIGHTSCOUT_URL;
    }
    return "https://" + NIGHTSCOUT_URL;
}

/**
 * last known authTicket
 */
let authTicket: AuthTicket = {duration: 0, expires: 0, token: ""};

const libreLinkUpHttpHeaders: LibreLinkUpHttpHeaders = {
    "User-Agent": USER_AGENT,
    "Content-Type": "application/json",
    "version": LIBRE_LINK_UP_VERSION,
    "product": LIBRE_LINK_UP_PRODUCT,
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Pragma": "no-cache",
    "Cache-Control": "no-cache",
    "Authorization": undefined
}

const nightScoutHttpHeaders: NightScoutHttpHeaders = {
    "api-secret": NIGHTSCOUT_API_TOKEN,
    "User-Agent": USER_AGENT,
    "Content-Type": "application/json",
}

if (process.env.SINGLE_SHOT === "true")
{
    main().then();
}
else
{
    const schedule = "*/" + (process.env.LINK_UP_TIME_INTERVAL || 5) + " * * * *";
    logger.info("Starting cron schedule: " + schedule)
    cron.schedule(schedule, () =>
    {
        main().then()
    }, {});
}

async function main(): Promise<void>
{
    if (!hasValidAuthentication())
    {
        logger.info("renew token");
        deleteAuthTicket();
        const authTicket: AuthTicket | null = await login();
        if (!authTicket)
        {
            logger.error("LibreLink Up - No AuthTicket received. Please check your credentials.");
            deleteAuthTicket();
            return;
        }
        updateAuthTicket(authTicket);
    }

    const glucoseGraphData: GraphData | null = await getGlucoseMeasurements();

    if (!glucoseGraphData)
    {
        return;
    }

    await uploadToNightScout(glucoseGraphData);
}

export async function login(): Promise<AuthTicket | null>
{
    try
    {
        const url = "https://" + LIBRE_LINK_UP_URL + "/llu/auth/login"
        const response: {data: LoginResponse} = await axios.post(
            url,
            {
                email: LINK_UP_USERNAME,
                password: LINK_UP_PASSWORD,
            },
            {
                headers: libreLinkUpHttpHeaders
            });

        try
        {
            if (response.data.status !== 0) {
                logger.error(`LibreLink Up - Non-zero status code: ${JSON.stringify(response.data)}`)
                return null;
            }
            if (response.data.data.redirect === true && response.data.data.region) {
                const correctRegion = response.data.data.region.toUpperCase();
                logger.error(
                    `LibreLink Up - Logged in to the wrong region. Switch to '${correctRegion}' region.`
                );
                return null;
            }
            logger.info("Logged in to LibreLink Up");
            return response.data.data.authTicket;
        } catch (err)
        {
            logger.error("Invalid authentication token. Please check your LibreLink Up credentials", err);
            return null;
        }
    } catch (error)
    {
        logger.error("Invalid credentials", error);
        return null;
    }
}

export async function getGlucoseMeasurements(): Promise<GraphData | null>
{
    try
    {
        const connectionId = await getLibreLinkUpConnection();
        if (!connectionId)
        {
            return null;
        }

        const url = "https://" + LIBRE_LINK_UP_URL + "/llu/connections/" + connectionId + "/graph"
        const response: {data: GraphResponse} = await axios.get(
            url,
            {
                headers: getLluAuthHeaders()
            });

        return response.data.data;
    } catch (error)
    {
        logger.error("Error getting glucose measurements", error);
        deleteAuthTicket();
        return null;
    }
}

export async function getLibreLinkUpConnection(): Promise<string | null>
{
    try
    {
        const url = "https://" + LIBRE_LINK_UP_URL + "/llu/connections"
        const response: {data: ConnectionsResponse} = await axios.get(
            url,
            {
                headers: getLluAuthHeaders()
            });

        const connectionData = response.data.data;

        if (connectionData.length === 0)
        {
            logger.error("No LibreLink Up connection found");
            return null;
        }

        if (connectionData.length === 1)
        {
            logger.info("Found 1 LibreLink Up connection.");
            logPickedUpConnection(connectionData[0]);
            return connectionData[0].patientId;
        }

        dumpConnectionData(connectionData);

        if (!process.env.LINK_UP_CONNECTION)
        {
            logger.warn("You did not specify a Patient-ID in the LINK_UP_CONNECTION environment variable.");
            logPickedUpConnection(connectionData[0]);
            return connectionData[0].patientId;
        }

        const connection = connectionData.filter(connectionEntry => connectionEntry.patientId === process.env.LINK_UP_CONNECTION)[0];
        if (!connection)
        {
            logger.error("The specified Patient-ID was not found.");
            return null;
        }

        logPickedUpConnection(connection);
        return connection.patientId;
    } catch (error)
    {
        logger.error("getting libreLinkUpConnection: ", error);
        deleteAuthTicket();
        return null;
    }
}

async function lastEntryDate(): Promise<Date | null>
{
    const url = getNightscoutUrl() + "/api/v1/entries?count=1"
    const response = await axios.get(
        url,
        {
            headers: nightScoutHttpHeaders
        });

    if (!response.data || response.data.length === 0)
    {
        return null;
    }
    return new Date(response.data.pop().dateString);
}

export async function createFormattedMeasurements(measurementData: GraphData): Promise<Entry[]>
{
    const formattedMeasurements: Entry[] = [];
    const glucoseMeasurement = measurementData.connection.glucoseMeasurement;
    const measurementDate = getUtcDateFromString(glucoseMeasurement.FactoryTimestamp);
    const lastEntry = await lastEntryDate();

    // Add the most recent measurement first
    if (lastEntry === null || measurementDate > lastEntry)
    {
        formattedMeasurements.push({
            "type": "sgv",
            "device": NIGHTSCOUT_DEVICE_NAME,
            "dateString": measurementDate.toISOString(),
            "date": measurementDate.getTime(),
            "direction": mapTrendArrow(glucoseMeasurement.TrendArrow),
            "sgv": glucoseMeasurement.ValueInMgPerDl
        });
    }

    measurementData.graphData.forEach((glucoseMeasurementHistoryEntry: GlucoseItem) =>
    {
        const entryDate = getUtcDateFromString(glucoseMeasurementHistoryEntry.FactoryTimestamp);
        if (lastEntry === null ||entryDate > lastEntry)
        {
            formattedMeasurements.push({
                "type": "sgv",
                "device": NIGHTSCOUT_DEVICE_NAME,
                "dateString": entryDate.toISOString(),
                "date": entryDate.getTime(),
                "sgv": glucoseMeasurementHistoryEntry.ValueInMgPerDl
            });
        }
    });
    return formattedMeasurements;
}

async function uploadToNightScout(measurementData: GraphData): Promise<void>
{
    const formattedMeasurements: Entry[] = await createFormattedMeasurements(measurementData);

    if (formattedMeasurements.length > 0)
    {
        logger.info("Trying to upload " + formattedMeasurements.length + " glucose measurement items to Nightscout");
        try
        {
            const url = getNightscoutUrl() + "/api/v1/entries"
            const response = await axios.post(
                url,
                formattedMeasurements,
                {
                    headers: nightScoutHttpHeaders
                });
            if (response.status !== 200)
            {
                logger.error("Upload to NightScout failed ", response.statusText);
            }
            else
            {
                logger.info("Upload of " + formattedMeasurements.length + " measurements to Nightscout succeeded");
            }
        } catch (error)
        {
            logger.error("Upload to NightScout failed ", error);
        }
    }
    else
    {
        logger.info("No new measurements to upload");
    }
}

function dumpConnectionData(connectionData: Connection[]): void
{
    logger.debug("Found " + connectionData.length + " LibreLink Up connections:");
    connectionData.map((connectionEntry: Connection, index: number) =>
    {
        logger.debug("[" + (index + 1) + "] " + connectionEntry.firstName + " " + connectionEntry.lastName + " (Patient-ID: " +
            connectionEntry.patientId + ")");
    });
}

function logPickedUpConnection(connection: Connection): void
{
    logger.info(
        "-> The following connection will be used: " + connection.firstName + " " + connection.lastName + " (Patient-ID: " +
        connection.patientId + ")");
}


function getLluAuthHeaders(): LibreLinkUpHttpHeaders
{
    const authenticatedHttpHeaders = libreLinkUpHttpHeaders;
    authenticatedHttpHeaders.Authorization = "Bearer " + getAuthenticationToken();
    logger.debug("authenticatedHttpHeaders: " + JSON.stringify(authenticatedHttpHeaders));
    return authenticatedHttpHeaders;
}

function deleteAuthTicket(): void
{
    authTicket = {duration: 0, expires: 0, token: ""};
}

function updateAuthTicket(newAuthTicket: AuthTicket): void
{
    authTicket = newAuthTicket;
}

function getAuthenticationToken(): string | null
{
    if (authTicket.token)
    {
        return authTicket.token;
    }

    logger.warn("no authTicket.token");

    return null;
}

function hasValidAuthentication(): boolean
{
    if (authTicket.expires !== undefined)
    {
        const currentDate = Math.round(new Date().getTime() / 1000);
        return currentDate < authTicket.expires;
    }

    logger.info("no authTicket.expires");

    return false;
}
