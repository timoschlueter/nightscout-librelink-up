/**
 * Google Sheets Client
 * Uploads hourly-aggregated glucose data to a Google Sheet and sets up a Charts sheet
 * with a time-range dropdown and embedded line chart.
 *
 * SPDX-License-Identifier: MIT
 */
import {google, sheets_v4} from "googleapis";
import {GoogleSheetsConfig, HourlyGlucoseRow} from "./interface";
import {GraphData} from "../interfaces/librelink/graph-response";
import {GlucoseItem} from "../interfaces/librelink/common";
import {getUtcDateFromString} from "../helpers/helpers";
import {logger} from "..";

const DATA_SHEET_NAME = "Data";
const CHARTS_SHEET_NAME = "Charts";

const DATA_HEADERS = ["Date", "Time", "Avg Glucose (mmol/L)", "Reading Count"];

const MGDL_TO_MMOL = 18.0182;

export class GoogleSheetsClient
{
    private readonly sheets: sheets_v4.Sheets;
    private readonly spreadsheetId: string;
    private chartsSheetNeedsSetup = false;
    private chartsSheetId: number | null = null;

    constructor(config: GoogleSheetsConfig)
    {
        const privateKey = config.googleServiceAccountPrivateKey.replace(/\\n/g, "\n");
        const auth = new google.auth.JWT(
            config.googleServiceAccountEmail,
            undefined,
            privateKey,
            ["https://www.googleapis.com/auth/spreadsheets"],
        );
        this.sheets = google.sheets({version: "v4", auth});
        this.spreadsheetId = config.googleSheetId;
    }

    async uploadGlucoseData(graphData: GraphData): Promise<void>
    {
        await this.initializeSheets();

        const lastTimestamp = await this.getLastRecordedTimestamp();

        const allItems: GlucoseItem[] = [
            ...graphData.graphData,
            graphData.connection.glucoseMeasurement,
        ];

        const hourlyRows = this.aggregateByHour(allItems, lastTimestamp);

        if (hourlyRows.length > 0)
        {
            await this.appendRows(hourlyRows);
            logger.info("Google Sheets: appended " + hourlyRows.length + " hourly row(s)");
        }
        else
        {
            logger.info("Google Sheets: no new hourly data to append");
        }

        if (this.chartsSheetNeedsSetup && this.chartsSheetId !== null)
        {
            await this.setupChartsSheet(this.chartsSheetId);
            this.chartsSheetNeedsSetup = false;
        }
    }

    private async initializeSheets(): Promise<void>
    {
        const spreadsheet = await this.sheets.spreadsheets.get({
            spreadsheetId: this.spreadsheetId,
        });

        const existingSheets = spreadsheet.data.sheets || [];
        const sheetNames = existingSheets.map(s => s.properties?.title);

        const hasData = sheetNames.includes(DATA_SHEET_NAME);
        const hasCharts = sheetNames.includes(CHARTS_SHEET_NAME);

        const requests: sheets_v4.Schema$Request[] = [];

        if (!hasData)
        {
            requests.push({
                addSheet: {
                    properties: {title: DATA_SHEET_NAME},
                },
            });
        }

        if (!hasCharts)
        {
            requests.push({
                addSheet: {
                    properties: {title: CHARTS_SHEET_NAME},
                },
            });
        }

        if (requests.length > 0)
        {
            const response = await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId: this.spreadsheetId,
                requestBody: {requests},
            });

            if (!hasData)
            {
                await this.sheets.spreadsheets.values.update({
                    spreadsheetId: this.spreadsheetId,
                    range: `${DATA_SHEET_NAME}!A1:D1`,
                    valueInputOption: "RAW",
                    requestBody: {values: [DATA_HEADERS]},
                });
            }

            if (!hasCharts)
            {
                const replies = response.data.replies || [];
                for (const reply of replies)
                {
                    if (reply.addSheet?.properties?.title === CHARTS_SHEET_NAME)
                    {
                        this.chartsSheetId = reply.addSheet.properties.sheetId ?? null;
                    }
                }
                this.chartsSheetNeedsSetup = true;
            }
        }
    }

    private async getLastRecordedTimestamp(): Promise<string | null>
    {
        const response = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.spreadsheetId,
            range: `${DATA_SHEET_NAME}!A:B`,
        });

        const rows = response.data.values;
        if (!rows || rows.length <= 1)
        {
            return null;
        }

        const lastRow = rows[rows.length - 1];
        const date = lastRow[0];
        const time = lastRow[1];
        if (date && time)
        {
            return `${date} ${time}`;
        }
        return null;
    }

    aggregateByHour(items: GlucoseItem[], lastTimestamp: string | null): HourlyGlucoseRow[]
    {
        const buckets = new Map<string, number[]>();

        for (const item of items)
        {
            const utcDate = getUtcDateFromString(item.FactoryTimestamp);
            const hourKey = this.formatHourKey(utcDate);

            if (lastTimestamp !== null && hourKey <= lastTimestamp)
            {
                continue;
            }

            if (!buckets.has(hourKey))
            {
                buckets.set(hourKey, []);
            }
            buckets.get(hourKey)!.push(item.ValueInMgPerDl);
        }

        const rows: HourlyGlucoseRow[] = [];

        for (const [hourKey, values] of buckets)
        {
            const sum = values.reduce((a, b) => a + b, 0);
            const avgMgDl = sum / values.length;
            const avgMmol = Math.round((avgMgDl / MGDL_TO_MMOL) * 10) / 10;

            const [date, time] = hourKey.split(" ");

            rows.push({
                date,
                time,
                avgGlucoseMmol: avgMmol,
                readingCount: values.length,
            });
        }

        rows.sort((a, b) =>
        {
            const keyA = `${a.date} ${a.time}`;
            const keyB = `${b.date} ${b.time}`;
            return keyA.localeCompare(keyB);
        });

        return rows;
    }

    private async appendRows(rows: HourlyGlucoseRow[]): Promise<void>
    {
        const values = rows.map(row => [
            row.date,
            row.time,
            row.avgGlucoseMmol,
            row.readingCount,
        ]);

        await this.sheets.spreadsheets.values.append({
            spreadsheetId: this.spreadsheetId,
            range: `${DATA_SHEET_NAME}!A:D`,
            valueInputOption: "USER_ENTERED",
            requestBody: {values},
        });
    }

    private async setupChartsSheet(chartsSheetId: number): Promise<void>
    {
        // Write labels, formulas, and headers
        await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.spreadsheetId,
            range: `${CHARTS_SHEET_NAME}!A1:D4`,
            valueInputOption: "USER_ENTERED",
            requestBody: {
                values: [
                    // Row 1: Time range selector
                    ["Time Range:", "1 Week", "", ""],
                    // Row 2: Computed start date
                    [
                        "Start Date:",
                        '=NOW()-SWITCH(B1,"1 Day",1,"1 Week",7,"14 Days",14,"21 Days",21,"1 Month",30,"3 Months",90,"6 Months",180,"1 Year",365,7)',
                        "",
                        "",
                    ],
                    // Row 3: Filtered data headers
                    ["Date", "Time", "Avg Glucose (mmol/L)", "Reading Count"],
                    // Row 4: FILTER formulas
                    [
                        `=IFERROR(FILTER(${DATA_SHEET_NAME}!A2:A,(${DATA_SHEET_NAME}!A2:A&" "&${DATA_SHEET_NAME}!B2:B)>=TEXT(B2,"YYYY-MM-DD HH:MM")),"")`,
                        `=IFERROR(FILTER(${DATA_SHEET_NAME}!B2:B,(${DATA_SHEET_NAME}!A2:A&" "&${DATA_SHEET_NAME}!B2:B)>=TEXT(B2,"YYYY-MM-DD HH:MM")),"")`,
                        `=IFERROR(FILTER(${DATA_SHEET_NAME}!C2:C,(${DATA_SHEET_NAME}!A2:A&" "&${DATA_SHEET_NAME}!B2:B)>=TEXT(B2,"YYYY-MM-DD HH:MM")),"")`,
                        `=IFERROR(FILTER(${DATA_SHEET_NAME}!D2:D,(${DATA_SHEET_NAME}!A2:A&" "&${DATA_SHEET_NAME}!B2:B)>=TEXT(B2,"YYYY-MM-DD HH:MM")),"")`,
                    ],
                ],
            },
        });

        // Add data validation dropdown for time range
        const dropdownRequest: sheets_v4.Schema$Request = {
            setDataValidation: {
                range: {
                    sheetId: chartsSheetId,
                    startRowIndex: 0,
                    endRowIndex: 1,
                    startColumnIndex: 1,
                    endColumnIndex: 2,
                },
                rule: {
                    condition: {
                        type: "ONE_OF_LIST",
                        values: [
                            {userEnteredValue: "1 Day"},
                            {userEnteredValue: "1 Week"},
                            {userEnteredValue: "14 Days"},
                            {userEnteredValue: "21 Days"},
                            {userEnteredValue: "1 Month"},
                            {userEnteredValue: "3 Months"},
                            {userEnteredValue: "6 Months"},
                            {userEnteredValue: "1 Year"},
                        ],
                    },
                    showCustomUi: true,
                    strict: true,
                },
            },
        };

        // Add embedded line chart
        const chartRequest: sheets_v4.Schema$Request = {
            addChart: {
                chart: {
                    position: {
                        overlayPosition: {
                            anchorCell: {
                                sheetId: chartsSheetId,
                                rowIndex: 5,
                                columnIndex: 0,
                            },
                            widthPixels: 900,
                            heightPixels: 450,
                        },
                    },
                    spec: {
                        title: "Glucose Levels Over Time",
                        basicChart: {
                            chartType: "LINE",
                            legendPosition: "BOTTOM_LEGEND",
                            axis: [
                                {
                                    position: "BOTTOM_AXIS",
                                    title: "Date / Time",
                                },
                                {
                                    position: "LEFT_AXIS",
                                    title: "Glucose (mmol/L)",
                                },
                            ],
                            domains: [
                                {
                                    domain: {
                                        sourceRange: {
                                            sources: [
                                                {
                                                    sheetId: chartsSheetId,
                                                    startRowIndex: 2,
                                                    startColumnIndex: 0,
                                                    endColumnIndex: 1,
                                                },
                                            ],
                                        },
                                    },
                                },
                            ],
                            series: [
                                {
                                    series: {
                                        sourceRange: {
                                            sources: [
                                                {
                                                    sheetId: chartsSheetId,
                                                    startRowIndex: 2,
                                                    startColumnIndex: 2,
                                                    endColumnIndex: 3,
                                                },
                                            ],
                                        },
                                    },
                                    targetAxis: "LEFT_AXIS",
                                    color: {
                                        red: 0.2,
                                        green: 0.5,
                                        blue: 0.9,
                                    },
                                },
                            ],
                            headerCount: 1,
                        },
                    },
                },
            },
        };

        await this.sheets.spreadsheets.batchUpdate({
            spreadsheetId: this.spreadsheetId,
            requestBody: {
                requests: [dropdownRequest, chartRequest],
            },
        });

        logger.info("Google Sheets: Charts sheet initialized with dropdown and chart");
    }

    private formatHourKey(date: Date): string
    {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, "0");
        const day = String(date.getUTCDate()).padStart(2, "0");
        const hour = String(date.getUTCHours()).padStart(2, "0");
        return `${year}-${month}-${day} ${hour}:00`;
    }
}
