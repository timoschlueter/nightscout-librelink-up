const cron = require("node-cron");
const axios = require("axios");
const { createLogger, format, transports } = require("winston");
const { combine, timestamp, printf } = format;

const NIGHTSCOUT_TREND_ARROWS = require('./nightscoutTrendArrows');

const logFormat = printf(({ level, message, timestamp }) => {
    return `${timestamp} [${level}]: ${message}`;
});

const logger = createLogger({
    format: combine(
        timestamp(),
        logFormat
    ),
    transports: [
        new transports.Console(),
    ]
});

/**
 * LibreLink Up Credentials
 */
const LINK_UP_USERNAME = process.env.LINK_UP_USERNAME;
const LINK_UP_PASSWORD = process.env.LINK_UP_PASSWORD;
const LINK_UP_CONNECTION = process.env.LINK_UP_CONNECTION;

/**
 * Nightscout API
 */
const NIGHTSCOUT_URL = process.env.NIGHTSCOUT_URL;
const NIGHTSCOUT_API_TOKEN = process.env.NIGHTSCOUT_API_TOKEN;

/**
 * LibreLink Up API Settings (Don't change this unless you know what you are doing)
 */
const API_URL = "api-eu.libreview.io"
const USER_AGENT = "FreeStyle LibreLink Up Nightscout Uploader";
const LIBRE_LINK_UP_VERSION = "4.1.1";
const LIBRE_LINK_UP_PRODUCT = "llu.ios";

let authTicket = {};

const libreLinkUpHttpHeaders = {
    "User-Agent": USER_AGENT,
    "Content-Type": "application/json",
    "version": LIBRE_LINK_UP_VERSION,
    "product": LIBRE_LINK_UP_PRODUCT,
}

const nightScoutHttpHeaders = {
    "api-secret": NIGHTSCOUT_API_TOKEN,
    "User-Agent": USER_AGENT,
    "Content-Type": "application/json",
}

logger.info("Started")
cron.schedule("* * * * *", () => {
    main();
});

function main() {
    if (hasValidAuthentication()) {
        getGlucoseMeasurement();
    }
    else {
        deleteToken();
        login();
    }
}

async function login() {
    const url = "https://" + API_URL + "/llu/auth/login"
    try {
        const response = await axios.post(url,
            {
                email: LINK_UP_USERNAME,
                password: LINK_UP_PASSWORD,
            },
            {
                headers: libreLinkUpHttpHeaders
            });

        try {
            const responseData = response.data;
            updateAuthTicket(responseData.data.authTicket);
            logger.info("Logged in to LibreLink Up");
            getGlucoseMeasurement();
        } catch (err) {
            logger.error("Invalid authentication token. Please check your LibreLink Up credentials");
        }
    } catch (error) {
        logger.error("Invalid credentials");
        deleteToken();
    }
}

async function getGlucoseMeasurement() {
    let connectionId = await getLibreLinkUpConnection();

    const url = "https://" + API_URL + "/llu/connections/" + connectionId + "/graph"

    let authenticatedHttpHeaders = libreLinkUpHttpHeaders;
    authenticatedHttpHeaders.authorization = "Bearer " + getAuthenticationToken();

    try {
        const response = await axios.get(url,
            {
                headers: authenticatedHttpHeaders
            });

        const responseData = response.data;
        let measurementData = responseData.data;
        logger.info("Received blood glucose measurement");
        uploadToNightscout(measurementData);
    } catch (error) {
        logger.error("Invalid credentials");
        deleteToken();
    }
}

async function getLibreLinkUpConnection() {
    const url = "https://" + API_URL + "/llu/connections"

    let authenticatedHttpHeaders = libreLinkUpHttpHeaders;
    authenticatedHttpHeaders.authorization = "Bearer " + getAuthenticationToken();

    try {
        const response = await axios.get(url,
            {
                headers: authenticatedHttpHeaders
            });

        const responseData = response.data;
        let connectionData = responseData.data;
        let connection;

        if (connectionData.length === 0) {
            logger.error("No LibreLink Up connection found");
            return null;
        }

        if (connectionData.length === 1)
        {
            connection = connectionData[0];
            logger.info("Found 1 LibreLink Up connection.");
            logger.info("-> The following connection will be used: " + connection.firstName + " " + connection.lastName  + " (Patient-ID: " + connection.patientId + ")");
            return connection.patientId;
        }

        if (connectionData.length > 1) {
            logger.info("Found " + connectionData.length + " LibreLink Up connections:");
            connectionData.map((connection, index) => {
                logger.info( "[" + (index + 1) + "] " + connection.firstName + " " + connection.lastName + " (Patient-ID: " + connection.patientId + ")");
            });

            if (!LINK_UP_CONNECTION)
            {
                connection = connectionData[0];
                logger.info("You did not specify a Patient-ID in the LINK_UP_CONNECTION environment variable.");
                logger.info("-> The following connection will be used: " + connection.firstName + " " + connection.lastName  + " (Patient-ID: " + connection.patientId + ")");
                return connection.patientId;
            }
            else
            {
                connection = connectionData.filter(connection => connection.patientId === LINK_UP_CONNECTION)[0];
                if (!connection)
                {
                    logger.error("The specified Patient-ID was not found.");
                    return null;
                }
                logger.info("-> The following connection will be used: " + connection.firstName + " " + connection.lastName  + " (Patient-ID: " + connection.patientId + ")");
                return connection.patientId;
            }
        }
    } catch (error) {
        logger.error("Invalid credentials");
        deleteToken();
        return null;
    }
}

async function uploadToNightscout(measurementData) {
    const glucoseMeasurement = measurementData.connection.glucoseMeasurement;
    const measurementDate = getUtcDateFromString(glucoseMeasurement.FactoryTimestamp);
    const glucoseMeasurementHistory = measurementData.graphData;

    let formattedMeasurements = [];

    // Add the most recent measurement first
    formattedMeasurements.push({
        "type": "sgv",
        "dateString": measurementDate.toISOString(),
        "date": measurementDate.getTime(),
        "direction": mapTrendArrow(glucoseMeasurement.TrendArrow),
        "sgv": glucoseMeasurement.ValueInMgPerDl
    });

    // Backfill with measurements from the graph data. Note: Nightscout handles duplicates. 
    // We don't have to worry about them here.
    glucoseMeasurementHistory.forEach((glucoseMeasurementHistoryEntry) => {
        let measurementDate = getUtcDateFromString(glucoseMeasurementHistoryEntry.FactoryTimestamp);
        formattedMeasurements.push({
            "type": "sgv",
            "dateString": measurementDate.toISOString(),
            "date": measurementDate.getTime(),
            "sgv": glucoseMeasurementHistoryEntry.ValueInMgPerDl
        });
    });

    const url = "https://" + NIGHTSCOUT_URL + "/api/v1/entries"
    try {
        const response = await axios.post(url,
            formattedMeasurements,
            {
                headers: nightScoutHttpHeaders
            });

        logger.info("Upload of " + formattedMeasurements.length + " measurements to Nightscout successfull");
    } catch (error) {
        logger.error("Upload to Nightscout failed");
        deleteToken();
    }
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

function deleteToken() {
    authTicket = {};
}

function updateAuthTicket(newAuthTicket) {
    authTicket = newAuthTicket;
}

function getAuthenticationToken() {
    if (authTicket.token) {
        return authTicket.token;
    }
    return null;
}

function hasValidAuthentication() {
    let expiryDate = authTicket.expires;
    let currentDate = Math.round(new Date().getTime() / 1000);
    return currentDate < expiryDate;
}

function getUtcDateFromString(timeStamp) 
{
    let utcDate = new Date(timeStamp);
    utcDate.setTime(utcDate.getTime() - new Date().getTimezoneOffset() * 60 * 1000);
    return utcDate;
}