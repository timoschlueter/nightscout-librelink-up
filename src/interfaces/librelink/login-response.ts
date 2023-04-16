/**
 * Interfaces for the Login responses
 *
 * SPDX-License-Identifier: MIT
 */
import {AuthTicket} from "./common";

interface Messages
{
    firstUsePhoenix: number;
    firstUsePhoenixReportsDataMerged: number;
    lluAnalyticsNewAccount: number;
    lluGettingStartedBanner: number;
    lluNewFeatureModal: number;
    lvWebPostRelease: string;
}

interface System
{
    messages: Messages;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface Details
{

}

interface TwoFactor
{
    primaryMethod: string;
    primaryValue: string;
    secondaryMethod: string;
    secondaryValue: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface Programs
{

}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface Practices
{

}

interface Device
{
    id: string;
    nickname: string;
    sn: string;
    type: number;
    uploadDate: number;
}
interface History
{
    policyAccept: number;
}

interface RealWorldEvidence
{
    policyAccept: number;
    touAccept: number;
    history: History[];
}

interface Consents
{
    realWorldEvidence: RealWorldEvidence;
}

interface User
{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    country: string;
    uiLanguage: string;
    communicationLanguage: string;
    accountType: string;
    uom: string;
    dateFormat: string;
    timeFormat: string;
    emailDay: number[];
    system: System;
    details: Details;
    twoFactor: TwoFactor;
    created: number;
    lastLogin: number;
    programs: Programs;
    dateOfBirth: number;
    practices: Practices;
    devices: [string, Device][];
    consents: Consents;
}

interface MessagesSummary
{
    unread: number;
}

interface Notifications
{
    unresolved: number;
}


interface LoginData
{
    user: User;
    messages: MessagesSummary;
    notifications: Notifications;
    authTicket: AuthTicket;
    invitations?: unknown;
    trustedDeviceToken: string;
    redirect?: boolean;
    region?: string;
}

export interface LoginResponse
{
    status: number;
    data: LoginData;
}

