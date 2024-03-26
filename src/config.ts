function readConfig() {
	const requiredEnvs = ['NIGHTSCOUT_API_TOKEN', 'NIGHTSCOUT_URL'];
	for (let envName of requiredEnvs) {
		if (!process.env[envName]) {
			throw Error(`Required environment variable ${envName} is not set`);
		}
	}

	const protocol =
		process.env.NIGHTSCOUT_DISABLE_HTTPS === 'true' ? 'http://' : 'https://';
	const url = new URL(protocol + process.env.NIGHTSCOUT_URL);

	return {
		nightscoutApiToken: process.env.NIGHTSCOUT_API_TOKEN as string,
		nightscoutBaseUrl: url.toString(),

		nightscoutApiV3: process.env.NIGHTSCOUT_API_V3 === 'true',
		nightscoutDevice: process.env.DEVICE_NAME || 'nightscout-librelink-up',
	};
}

export default readConfig;
