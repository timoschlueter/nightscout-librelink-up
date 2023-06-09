interface LluApiEndpoints {
    [key: string]: string;
}

export const LLU_API_ENDPOINTS: LluApiEndpoints = {
    AE: "api-ae.libreview.io",
    AP: "api-ap.libreview.io",
    AU: "api-au.libreview.io",
    CA: "api-ca.libreview.io",
    DE: "api-de.libreview.io",
    EU: "api-eu.libreview.io",
    EU2: "api-eu2.libreview.io",
    FR: "api-fr.libreview.io",
    JP: "api-jp.libreview.io",
    US: "api-us.libreview.io",
} as const;
