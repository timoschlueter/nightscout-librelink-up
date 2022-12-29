/**
 * Common Interfaces for the API responses
 *
 * SPDX-License-Identifier: MIT
 */

interface H
{
    th: number;
    thmm: number;
    d: number;
    f: number;
}

interface F
{
    th: number;
    thmm: number;
    d: number;
    tl: number;
    tlmm: number;
}

interface L
{
    th: number;
    thmm: number;
    d: number;
    tl: number;
    tlmm: number;
}

interface Nd
{
    i: number;
    r: number;
    l: number;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface Std
{

}

interface AlarmRules
{
    c: boolean;
    h: H;
    f: F;
    l: L;
    nd: Nd;
    p: number;
    r: number;
    std: Std;
}


export interface GlucoseItem
{
    FactoryTimestamp: string;
    Timestamp: string;
    type: number;
    ValueInMgPerDl: number;
    TrendArrow?: number;
    TrendMessage?: unknown;
    MeasurementColor: number;
    GlucoseUnits: number;
    Value: number;
    isHigh: boolean;
    isLow: boolean;
}

export interface GlucoseMeasurement extends GlucoseItem
{
    TrendArrow: number;
}

interface FixedLowAlarmValues
{
    mgdl: number;
    mmoll: number;
}

export interface PatientDevice
{
    did: string;
    dtid: number;
    v: string;
    ll: number;
    hl: number;
    u: number;
    fixedLowAlarmValues: FixedLowAlarmValues;
    alarms: boolean;
    fixedLowThreshold: number;
    l?: boolean;
    h?: boolean;
}

export interface Sensor
{
    deviceId: string;
    sn: string;
    a: number;
    w: number;
    pt: number;
    s: boolean;
    lj: boolean;
}

export interface AuthTicket
{
    token: string;
    expires: number;
    duration: number;
}

export interface Connection
{
    id: string;
    patientId: string;
    country: string;
    status: number;
    firstName: string;
    lastName: string;
    targetLow: number;
    targetHigh: number;
    uom: number;
    sensor: Sensor;
    alarmRules: AlarmRules;
    glucoseMeasurement: GlucoseMeasurement;
    glucoseItem: GlucoseItem;
    glucoseAlarm?: unknown;
    patientDevice: PatientDevice;
    created: number;
}
