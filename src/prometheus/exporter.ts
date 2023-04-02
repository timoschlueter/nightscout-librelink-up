
import {writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {GraphData} from "../interfaces/librelink/graph-response";
import {getUtcDateFromString} from "../helpers/helpers";
import type {Logger} from "winston";

import express from 'express';
import type { Request, Response } from "express";
import { register, Gauge } from 'prom-client';
import { GlucoseMeasurement } from "../interfaces/librelink/common";

const exampleJson = `${tmpdir()}/librelink-example.json`;

const glucoseValue = new Gauge({ name: 'glucose_value', help: 'current value mmol/L' });
const glucoseTrend = new Gauge({ name: 'glucose_trend', help: 'trend arrow value as reported by librelink up' });
const glucoseHigh =  new Gauge({ name: 'glucose_high',  help: 'glucose high 1.0=true 0.0=false' });
const glucoseLow =   new Gauge({ name: 'glucose_low',   help: 'glucose high 1.0=true 0.0=false' });

let exporting = false;

export interface PrometheusExportServerOptions {
    port: number,
    logger: Logger,
    endpoint: string,
}

export async function prometheusEndpointInit(options: PrometheusExportServerOptions) {
    const server = express();
    server.get(options.endpoint, async (req: Request, res: Response) => {
        try {
            res.set('Content-Type', register.contentType);
            res.end(await register.metrics());
        } catch (ex) {
            res.status(500).end(ex);
        }
    });
    server.get('/', async (req: Request, res: Response) => {
        res.setHeader('content-type', 'text/plain');
        res.send(`Online, see ${options.endpoint}\n`);
    });

    exporting = true;
    options.logger.info(`Prometheus export at :${options.port}${options.endpoint}`);
    server.listen(options.port);
}

export async function prometheusExport(measurementData: GraphData): Promise<void>
{
    const current = measurementData.connection.glucoseMeasurement;
    if (!exporting) {
        console.log('Example measurement', getUtcDateFromString(current.FactoryTimestamp), current);
        await writeFile(exampleJson, JSON.stringify(measurementData), 'utf8');
        console.warn('Prometheus exporter not initialized; response written to', exampleJson);
        return;
    }
    exportCurrent(current);
}

function exportCurrent(measurement: GlucoseMeasurement) {
    glucoseValue.set(measurement.Value);
    glucoseTrend.set(measurement.TrendArrow);
    glucoseHigh.set(measurement.isHigh ? 1 : 0);
    glucoseLow.set(measurement.isLow ? 1 : 0);
}
