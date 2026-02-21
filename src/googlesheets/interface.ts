/**
 * Interfaces related to the Google Sheets integration
 *
 * SPDX-License-Identifier: MIT
 */

export interface GoogleSheetsConfig {
    googleSheetId: string;
    googleServiceAccountEmail: string;
    googleServiceAccountPrivateKey: string;
}

export interface HourlyGlucoseRow {
    date: string;           // "YYYY-MM-DD"
    time: string;           // "HH:00"
    avgGlucoseMmol: number; // mg/dL ÷ 18.0182, rounded to 1 decimal
    readingCount: number;
}
