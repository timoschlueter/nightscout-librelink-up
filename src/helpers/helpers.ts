/**
 * Helper Functions
 *
 * SPDX-License-Identifier: MIT
 */
import {NIGHTSCOUT_TREND_ARROWS} from "../constants/nightscout-trend-arrows";

export function mapTrendArrow(libreTrendArrowRaw: number): string
{
    switch (libreTrendArrowRaw)
    {
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

export function getUtcDateFromString(timeStamp: string): Date
{
    const utcDate = new Date(timeStamp);
    utcDate.setTime(utcDate.getTime() - utcDate.getTimezoneOffset() * 60 * 1000);
    return utcDate;
}
