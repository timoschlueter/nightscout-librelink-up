/**
 * HTTP Headers
 *
 * SPDX-License-Identifier: MIT
 */
import {RawAxiosRequestHeaders} from "axios";

export interface LibreLinkUpHttpHeaders extends RawAxiosRequestHeaders
{
    "version": string,
    "product": string,
}

