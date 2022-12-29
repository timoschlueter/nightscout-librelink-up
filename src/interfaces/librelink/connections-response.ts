/**
 * Interfaces for the Connection responses
 *
 * SPDX-License-Identifier: MIT
 */
import {AuthTicket, Connection} from "./common";

export interface ConnectionsResponse
{
    status: number;
    data: Connection[];
    ticket: AuthTicket;
}
