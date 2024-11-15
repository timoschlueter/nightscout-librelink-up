/**
 * Interfaces for the JSON Web Token (JWT)
 *
 * SPDX-License-Identifier: MIT
 */

export interface Jwt
{
    id: string;
    firstName: string;
    lastName: string;
    country: string;
    region: string;
    role: string;
    units: number;
    practices: Array<string>;
    c: number;
    s: string;
    exp: number;
}
