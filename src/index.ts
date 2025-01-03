/**
 * Nightscout LibreLink Up Uploader/Sidecar
 * Script written in TypeScript that uploads CGM readings from LibreLink Up to Nightscout.
 *
 * SPDX-License-Identifier: MIT
 */
import {LLU_API_ENDPOINTS} from "./constants/llu-api-endpoints";
import * as cron from "node-cron";
import axios from "axios";
import {createLogger, format, transports} from "winston";
import {LoginResponse} from "./interfaces/librelink/login-response";
import {ConnectionsResponse} from "./interfaces/librelink/connections-response";
import {GraphData, GraphResponse} from "./interfaces/librelink/graph-response";
import {AuthTicket, Connection, GlucoseItem} from "./interfaces/librelink/common";
import {getUtcDateFromString, mapTrendArrow} from "./helpers/helpers";
import {LibreLinkUpHttpHeaders} from "./interfaces/http-headers";
import {Client as ClientV1} from "./nightscout/apiv1";
import {Client as ClientV3} from "./nightscout/apiv3";
import {Entry} from "./nightscout/interface";
import readConfig from "./config";
import {CookieJar} from "tough-cookie";
import {HttpCookieAgent} from "http-cookie-agent/http";
import {Agent as HttpAgent} from "node:http";
import {Agent as HttpsAgent} from "node:https";
import * as crypto from "crypto";

// Generate new Ciphers for stealth mode in order to bypass SSL fingerprinting used by Cloudflare.
// The new Ciphers are then used in the HTTPS Agent for Axios.
const defaultCiphers: Array<string> = crypto.constants.defaultCipherList.split(":");
const stealthCiphers: Array<string> = [
    defaultCiphers[0],
    defaultCiphers[2],
    defaultCiphers[1],
    ...defaultCiphers.slice(3)
];

const stealthHttpsAgent: HttpsAgent = new HttpsAgent({
    ciphers: stealthCiphers.join(":")
});

// Create a new CookieJar and HttpCookieAgent for Axios to handle cookies.
const jar: CookieJar = new CookieJar();
const cookieAgent: HttpAgent = new HttpCookieAgent({cookies: {jar}})

let config = readConfig();

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
        new transports.Console({level: config.logLevel}),
    ]
});

axios.interceptors.response.use(
    response => response,
    error =>
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
    }
);

const USER_AGENT = "Mozilla/5.0 (iPhone; CPU OS 17_4.1 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Version/17.4.1 Mobile/10A5355d Safari/8536.25";

/**
 * LibreLink Up API Settings (Don't change this unless you know what you are doing)
 */
const LIBRE_LINK_UP_VERSION = "4.12.0";
const LIBRE_LINK_UP_PRODUCT = "llu.ios";
const LIBRE_LINK_UP_URL = LLU_API_ENDPOINTS[config.linkUpRegion];

/**
 * last known authTicket
 */
let authTicket: AuthTicket = {duration: 0, expires: 0, token: ""};
let userId: string = "";

const libreLinkUpHttpHeaders: LibreLinkUpHttpHeaders = {
    "User-Agent": USER_AGENT,
    "Content-Type": "application/json;charset=UTF-8",
    "version": LIBRE_LINK_UP_VERSION,
    "product": LIBRE_LINK_UP_PRODUCT,
    "account-id": "",
}

if (config.singleShot)
{
    main().then();
}
else
{
    const schedule = `*/${config.linkUpTimeInterval} * * * *`;
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
        deleteAccountId();
        const authTicket: AuthTicket | null = await login();
        if (!authTicket)
        {
            logger.error("LibreLink Up - No AuthTicket received. Please check your credentials.");
            deleteAuthTicket();
            deleteAccountId();
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
    config = readConfig()

    try
    {
        const url = "https://" + LIBRE_LINK_UP_URL + "/llu/auth/login"
        const response: { data: LoginResponse } = await axios.post(
            url,
            {
                email: config.linkUpUsername,
                password: config.linkUpPassword,
            },
            {
                headers: libreLinkUpHttpHeaders,
                withCredentials: true, // Enable automatic cookie handling
                httpAgent: cookieAgent,
                httpsAgent: stealthHttpsAgent
            });

        try
        {
            if (response.data.status !== 0)
            {
                logger.error(`LibreLink Up - Non-zero status code: ${JSON.stringify(response.data)}`)
                return null;
            }
            if (response.data.data.redirect === true && response.data.data.region)
            {
                const correctRegion = response.data.data.region.toUpperCase();
                logger.error(
                    `LibreLink Up - Logged in to the wrong region. Switch to '${correctRegion}' region.`
                );
                return null;
            }
            logger.info("Logged in to LibreLink Up");
            updateAccountId(response.data.data.user.id);
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
    config = readConfig()

    try
    {
        const connectionId = await getLibreLinkUpConnection();
        if (!connectionId)
        {
            return null;
        }

        const url = "https://" + LIBRE_LINK_UP_URL + "/llu/connections/" + connectionId + "/graph"
        const response: { data: GraphResponse } = await axios.get(
            url,
            {
                headers: getLluAuthHeaders(),
                withCredentials: true, // Enable automatic cookie handling
                httpAgent: cookieAgent,
                httpsAgent: stealthHttpsAgent,
            });

        return response.data.data;
    } catch (error)
    {
        logger.error("Error getting glucose measurements", error);
        deleteAuthTicket();
        deleteAccountId();
        return null;
    }
}

export async function getLibreLinkUpConnection(): Promise<string | null>
{
    config = readConfig()

    try
    {
        const url = "https://" + LIBRE_LINK_UP_URL + "/llu/connections"
        const response: { data: ConnectionsResponse } = await axios.get(
            url,
            {
                headers: getLluAuthHeaders(),
                withCredentials: true, // Enable automatic cookie handling
                httpAgent: cookieAgent,
                httpsAgent: stealthHttpsAgent,
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

        if (!config.linkUpConnection)
        {
            logger.warn("You did not specify a Patient-ID in the LINK_UP_CONNECTION environment variable.");
            logPickedUpConnection(connectionData[0]);
            return connectionData[0].patientId;
        }

        const connection = connectionData.filter(connectionEntry => connectionEntry.patientId === config.linkUpConnection)[0];

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
        deleteAccountId();
        return null;
    }
}

const nightscoutClient = config.nightscoutApiV3
    ? new ClientV3(config)
    : new ClientV1(config);

export async function createFormattedMeasurements(measurementData: GraphData): Promise<Entry[]>
{
    const formattedMeasurements: Entry[] = [];
    const glucoseMeasurement = measurementData.connection.glucoseMeasurement;
    const measurementDate = getUtcDateFromString(glucoseMeasurement.FactoryTimestamp);
    const lastEntry = config.allData ? null : await nightscoutClient.lastEntry();
    // Add the most recent measurement first
    if (lastEntry === null || measurementDate > lastEntry.date)
    {
        formattedMeasurements.push({
            date: measurementDate,
            direction: mapTrendArrow(glucoseMeasurement.TrendArrow),
            sgv: glucoseMeasurement.ValueInMgPerDl
        });
    }

    measurementData.graphData.forEach((glucoseMeasurementHistoryEntry: GlucoseItem) =>
    {
        const entryDate = getUtcDateFromString(glucoseMeasurementHistoryEntry.FactoryTimestamp);
        if (lastEntry === null || entryDate > lastEntry.date)
        {
            formattedMeasurements.push({
                date: entryDate,
                sgv: glucoseMeasurementHistoryEntry.ValueInMgPerDl,
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
            await nightscoutClient.uploadEntries(formattedMeasurements);
            logger.info("Upload of " + formattedMeasurements.length + " measurements to Nightscout succeeded");
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

    if (authTicket)
    {
        try
        {
            // Add SHA-256 hashed account-id to the headers
            authenticatedHttpHeaders["account-id"] = crypto.createHash("sha256").update(getUserId()).digest("hex");
        } catch (error)
        {
            logger.error("Error getting accountId: ", error);
        }
    }
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

function deleteAccountId(): void
{
    userId = "";
}

function updateAccountId(newUserId: string): void
{
    userId = newUserId;
}

function getUserId(): string
{
    return userId;
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
