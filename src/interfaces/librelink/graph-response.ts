/**
 * Interfaces for the Graph responses which contain historical glucose measurements
 *
 * SPDX-License-Identifier: MIT
 */
import {AuthTicket, Connection, GlucoseItem, PatientDevice, Sensor} from "./common";

interface ActiveSensor
{
    sensor: Sensor;
    device: PatientDevice;
}

export interface GraphData
{
    connection: Connection;
    activeSensors: ActiveSensor[];
    graphData: GlucoseItem[];
}

export interface GraphResponse
{
    status: number;
    data: GraphData;
    ticket: AuthTicket;
}
