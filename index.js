const cron = require("node-cron");
const axios = require("axios");

const {createLogger, format, transports} = require("winston");
const {combine, timestamp, printf} = format;

const NIGHTSCOUT_TREND_ARROWS = require('./nightscoutTrendArrows');

const logFormat = printf(({level, message}) => {
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

axios.interceptors.response.use(response => {
    return response;
}, error => {
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
const LINK_UP_CONNECTION = process.env.LINK_UP_CONNECTION;

/**
 * LibreLink Up API Settings (Don't change this unless you know what you are doing)
 */
const LIBRE_LINK_UP_URL = "api-eu.libreview.io"
const LIBRE_LINK_UP_VERSION = "4.1.1";
const LIBRE_LINK_UP_PRODUCT = "llu.ios";

/**
 * NightScout API
 */
const NIGHT_SCOUT_URL = process.env.NIGHTSCOUT_URL;
const NIGHT_SCOUT_API_TOKEN = process.env.NIGHTSCOUT_API_TOKEN;

/**
 * last known authTicket
 */
let authTicket = {};

const libreLinkUpHttpHeaders = {
    "User-Agent": USER_AGENT,
    "Content-Type": "application/json",
    "version": LIBRE_LINK_UP_VERSION,
    "product": LIBRE_LINK_UP_PRODUCT,
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Pragma": "no-cache",
    "Cache-Control": "no-cache",
}

const nightScoutHttpHeaders = {
    "api-secret": NIGHT_SCOUT_API_TOKEN,
    "User-Agent": USER_AGENT,
    "Content-Type": "application/json",
}

const schedule = "*/" + (process.env.LINK_UP_TIME_INTERVAL || 5) + " * * * *";
logger.info("Starting cron schedule: " + schedule)
cron.schedule(schedule, () => {main();}, {});

async function main() {
    if (hasValidAuthentication() === false) {
        logger.info("renew token");
        deleteAuthTicket();
        await login();
    }
    await getGlucoseMeasurements();
}

async function login() {
    try {
        const url = "https://" + LIBRE_LINK_UP_URL + "/llu/auth/login"
        const response = await axios.post(
            url,
            {
                email: LINK_UP_USERNAME,
                password: LINK_UP_PASSWORD,
            },
            {
                headers: libreLinkUpHttpHeaders
            });

        try {
            logger.info("Logged in to LibreLink Up");
            updateAuthTicket(response.data.data.authTicket);
        } catch (err) {
            logger.error("Invalid authentication token. Please check your LibreLink Up credentials", err);
        }
    } catch (error) {
        logger.error("Invalid credentials", error);
        deleteAuthTicket();
    }
}

async function getGlucoseMeasurements() {
    try {
        let connectionId = await getLibreLinkUpConnection();
        if (!connectionId) {
            return;
        }

        const url = "https://" + LIBRE_LINK_UP_URL + "/llu/connections/" + connectionId + "/graph"
        const response = await axios.get(
            url,
            {
                headers: getLluAuthHeaders()
            });

        logger.info("Received blood glucose measurement items");

        await uploadToNightScout(response.data.data);
    } catch (error) {
        logger.error("Error getting glucose measurements", error);
        deleteAuthTicket();
    }
}

async function getLibreLinkUpConnection() {
    try {
        const url = "https://" + LIBRE_LINK_UP_URL + "/llu/connections"
        const response = await axios.get(
            url,
            {
                headers: getLluAuthHeaders()
            });

        let connectionData = response.data.data;

        if (connectionData.length === 0) {
            logger.error("No LibreLink Up connection found");
            return null;
        }

        if (connectionData.length === 1) {
            logger.info("Found 1 LibreLink Up connection.");
            logPickedUpConnection(connectionData[0]);
            return connectionData[0].patientId;
        }

        dumpConnectionData(connectionData);

        if (!LINK_UP_CONNECTION) {
            logger.warn("You did not specify a Patient-ID in the LINK_UP_CONNECTION environment variable.");
            logPickedUpConnection(connectionData[0]);
            return connectionData[0].patientId;
        }

        let connection = connectionData.filter(connectionEntry => connectionEntry.patientId === LINK_UP_CONNECTION)[0];
        if (!connection) {
            logger.error("The specified Patient-ID was not found.");
            return null;
        }

        logPickedUpConnection(connection)
        return connection.patientId;
    } catch (error) {
        logger.error("getting libreLinkUpConnection: ", error);
        deleteAuthTicket();
        return null;
    }
}

async function lastEntryDate() {
    const url = "https://" + NIGHT_SCOUT_URL + "/api/v1/entries?count=1"
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

async function uploadToNightScout(measurementData) {
    const glucoseMeasurement = measurementData.connection.glucoseMeasurement;
    const measurementDate = getUtcDateFromString(glucoseMeasurement.FactoryTimestamp);

    let lastEntry = await lastEntryDate();

    let formattedMeasurements = [];

    // Add the most recent measurement first
    if (measurementDate > lastEntry) {
        formattedMeasurements.push({
            "type": "sgv",
            "dateString": measurementDate.toISOString(),
            "date": measurementDate.getTime(),
            "direction": mapTrendArrow(glucoseMeasurement.TrendArrow),
            "sgv": glucoseMeasurement.ValueInMgPerDl
        });
    }

    measurementData.graphData.forEach((glucoseMeasurementHistoryEntry) => {
        let entryDate = getUtcDateFromString(glucoseMeasurementHistoryEntry.FactoryTimestamp);
        if (entryDate > lastEntry) {
            formattedMeasurements.push({
                "type": "sgv",
                "dateString": entryDate.toISOString(),
                "date": entryDate.getTime(),
                "sgv": glucoseMeasurementHistoryEntry.ValueInMgPerDl
            });
        }
    });

    try {
        const url = "https://" + NIGHT_SCOUT_URL + "/api/v1/entries"
        await axios.post(
            url,
            formattedMeasurements,
            {
                headers: nightScoutHttpHeaders
            });

        logger.info("Upload of " + formattedMeasurements.length + " measurements to NightScout succeeded");
    } catch (error) {
        logger.error("Upload to NightScout failed ", error);
    }
}

function dumpConnectionData(connectionData) {
    logger.debug("Found " + connectionData.length + " LibreLink Up connections:");
    connectionData.map((connectionEntry, index) => {
        logger.debug("[" + (index + 1) + "] " + connectionEntry.firstName + " " + connectionEntry.lastName + " (Patient-ID: " + connectionEntry.patientId + ")");
    });
}

function logPickedUpConnection(connection) {
    logger.info("-> The following connection will be used: " + connection.firstName + " " + connection.lastName + " (Patient-ID: " + connection.patientId + ")");
}

function mapTrendArrow(libreTrendArrowRaw) {
    switch (libreTrendArrowRaw) {
        case 1:
            return NIGHTSCOUT_TREND_ARROWS.singleDown
        case 2:
            return NIGHTSCOUT_TREND_ARROWS.fortyFiveDown
        case 3:
            return NIGHTSCOUT_TREND_ARROWS.flat
        case 4:
            return NIGHTSCOUT_TREND_ARROWS.fortyFiveUp
        case 5:
            return NIGHTSCOUT_TREND_ARROWS.singleUp
        default:
            return NIGHTSCOUT_TREND_ARROWS.notComputable
    }
}

function getLluAuthHeaders() {
    let authenticatedHttpHeaders = libreLinkUpHttpHeaders;
    authenticatedHttpHeaders.authorization = "Bearer " + getAuthenticationToken();
    logger.debug("authenticatedHttpHeaders: " + JSON.stringify(authenticatedHttpHeaders));
    return authenticatedHttpHeaders;
}

function deleteAuthTicket() {
    authTicket = {};
}

function updateAuthTicket(newAuthTicket) {
    authTicket = newAuthTicket;
}

function getAuthenticationToken() {
    if (authTicket.token) {
        return authTicket.token;
    }

    logger.warn("no authTicket.token");

    return null;
}

function hasValidAuthentication() {
    if (authTicket.expires !== undefined) {
        let currentDate = Math.round(new Date().getTime() / 1000);

        return currentDate < authTicket.expires;
    }

    logger.info("no authTicket.expires");

    return false;
}

function getUtcDateFromString(timeStamp) {
    let utcDate = new Date(timeStamp);
    utcDate.setTime(utcDate.getTime() - utcDate.getTimezoneOffset() * 60 * 1000);
    return utcDate;
}
