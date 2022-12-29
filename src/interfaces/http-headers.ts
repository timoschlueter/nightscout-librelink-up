/**
 * HTTP Headers
 *
 * SPDX-License-Identifier: MIT
 */
import {OutgoingHttpHeaders} from "http";

export interface LibreLinkUpHttpHeaders extends OutgoingHttpHeaders {
    "version": string,
    "product": string,
}

export interface NightScoutHttpHeaders extends OutgoingHttpHeaders {
    "api-secret": string | undefined,
}
