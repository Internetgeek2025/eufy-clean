// Communication with the Local Tuya API
// This is only supported for "old" devices like the RoboVac G30
import TuyAPI from 'tuyapi';
import { SharedConnect } from './SharedConnect';

export class LocalConnect extends SharedConnect {
    public api: any;
    public connected: boolean = false;
    public statuses = null;
    public lastStatusUpdate: number = null;
    public maxStatusUpdateAge: number = 1000 * (1 * 30); //30 Seconds
    public timeoutDuration: number = 2;

    constructor(config: { deviceId: string, localKey?: string, ip?: string, debug?: boolean, deviceModel?: string}) {
        super(config);

        if (!config.deviceId) {
            throw new Error('You must pass through deviceId');
        }

        this.debugLog = config.debug || false;

        this.api = new TuyAPI(
            {
                id: config.deviceId,
                key: config.localKey,
                ip: config.ip,
                port: 6668,
                version: '3.3'
            }
        );

        this.api.on('error', (error: any) => {
            console.error('Robovac Error', error);
        });

        this.api.on('connected', () => {
            this.connected = true;
            console.log("Connected!");
        });

        this.api.on('disconnected', () => {
            this.connected = false;
            console.log('Disconnected!');
        });

        this.api.on('dp-refresh', data => {
            if (!this.novelApi && Object.values(this.novelDPSMap).some(k => k in data.dps)) {
                console.log('New API detected');
                this.setApiTypes(true);
            }


            console.log('DP_REFRESH data from device: ', data);



            this.mapData(data.dps);
            
        });

        this.api.on('data', (data) => {
            if (!this.novelApi && Object.values(this.novelDPSMap).some(k => k in data.dps)) {
                console.log('New API detected');
                this.setApiTypes(true);
            }


            console.log('Data from device:', data);



            this.mapData(data.dps);
        });
    }

    mapData(dps: any) {
        let mappedData = this.DPSMap

        // Map the data to the correct keys
        for (const key in dps) {
            if (dps.hasOwnProperty(key)) {
                const value = dps[key];
                const mappedKey = Object.keys(mappedData).find(k => mappedData[k] === key);

                if (mappedKey) {
                    mappedData[mappedKey] = value;
                }
            }
        }

        this.robovacData = {...this.robovacData, ...mappedData };
    }

    async setApiTypes(novelApi: boolean) {
        this.novelApi = novelApi;

        this.DPSMap = novelApi ? this.novelDPSMap : this.DPSMap;
    }

    async connect(formatStatus: boolean = false) {
        if (!this.connected) {
            console.log('Connecting...');

            await this.api.connect().catch(error => {
                console.log(error)
                console.error(
                    `Failed to connect to device please close the app or check your network. Please allow port 6668 via TCP from the device IP. ${error}`,
                );
            });
        }

        await this.api.refresh({ schema: true });

        if (formatStatus) {
            setTimeout(() => {
                this.formatStatus();
            }, 2000);
        }
    }

    async disconnect() {
        console.log('Disconnecting...');
        await this.api.disconnect();
    }

    async getStatuses(force: boolean = false): Promise<{ devId: string, dps: { [key: string]: string | boolean | number } }> {
        if (force || (new Date()).getTime() - this.lastStatusUpdate > this.maxStatusUpdateAge) {
            return await this.doWork(async () => {
                this.statuses = await this.api.get({ schema: true });
                this.lastStatusUpdate = (new Date()).getTime();

                return this.statuses;
            });
        } else {
            return this.statuses;
        }
        // return this.robovacData;
    }

    async doWork(work: () => Promise<any>): Promise<any> {
        if (!this.api.device.id || !this.api.device.ip) {

            console.log('Looking for device...');

            try {
                await this.api.find({ timeout: this.timeoutDuration });

                console.log(`Found device ${this.api.device.id} at ${this.api.device.ip}`);

            } catch (err) {
                console.log(err);
            }
        }
        await this.connect();
        return await work();
    }

    async sendCommand(data: { [key: string]: string | number | boolean }) {
        if (this.debugLog) {
            console.log(`Setting: ${JSON.stringify(data, null, 4)}`);
        }

        return await this.api.set({
            multiple: true,
            data: data
        });
    }
}
