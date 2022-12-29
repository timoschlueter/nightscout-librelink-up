/**
 * Interfaces related to the Nightscout API
 *
 * SPDX-License-Identifier: MIT
 */
export interface Entry
{
    type: string;
    dateString: string;
    date: number;
    direction?: string;
    sgv: number;
}
