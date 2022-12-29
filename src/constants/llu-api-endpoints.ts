interface LluApiEndpoints {
    [key: string]: string;
}

export const LLU_API_ENDPOINTS: LluApiEndpoints = {
    US: "api-us.libreview.io",
    EU: "api-eu.libreview.io",
    DE: "api-de.libreview.io",
    FR: "api-fr.libreview.io",
    JP: "api-jp.libreview.io",
    AP: "api-ap.libreview.io",
    AU: "api-au.libreview.io",
    AE: "api-ae.libreview.io",
} as const;
