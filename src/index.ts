/**
 * Little script to merge (or fake) an Heatpump Boiler as a Shelly 1
 * with temperature sensors
 *
 * To use it, define the following three environment variables:
 *
 * OB_USER_MAIL: your Oekoboiler E-Mail
 * OB_USER_PASSWORD: your Oekoboiler Password
 * OB_DSN: The DSN of your Oekoboiler
 *
 * If you're unsure about the DSN, have a look at `oekoboiler-api`
 * and the example provided therein to get all your Boiler's DSNs
 */
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { CoapServer, HttpServer } from 'fake-shelly';
import { Shelly1PM } from 'fake-shelly/devices';
import { OekoboilerApi, OekoboilerDevice } from 'oekoboiler-api';
import 'dotenv/config';

const mac = '00404F74DE83';
const interval = 30;

class OekboilerShelly extends Shelly1PM {
  public dsn: string = process.env.OB_DSN || '';
  public upstreamPowerMeter: string = process.env.OB_MYSTROM_METER || '';
  public upstreamPVSwitch: string = process.env.OB_SHELLY_SWITCH || '';

  private api = new OekoboilerApi(
    process.env.OB_USER_MAIL || '',
    process.env.OB_USER_PASSWORD || '',
  );
  private boiler: OekoboilerDevice | undefined = undefined;

  constructor(id: string) {
    super(id);

    this.macAddress = id;
    // Remove event emitter
    this.removeListener('change:relay0');

    // Add new listener
    this.on('change:relay0', (newValue) => {
      // Must trickle this down, i.e. set relay of upstream Shelly
      axios.get(
        `${this.upstreamPVSwitch}/relay/0?turn=${newValue ? 'on' : 'off'}`,
      );
    });

    // Define Temperature property
    this._defineProperty('temperature', 0, null, Number);

    // Update consumption and temperature from source devices
    this.updateCurrentConsumption().then(() => {
      setInterval(() => {
        // Device will emit changed values
        this.updateCurrentConsumption();
      }, (interval / 3) * 1000);
    });

    this.updateCurrentTemperature().then(() => {
      // Set an interval to update the temperature
      setInterval(() => {
        // Device will emit changed values
        this.updateCurrentTemperature();
      }, interval * 1000);
    });
  }

  private async updateCurrentTemperature() {
    await this.api.getBoiler(this.dsn).then((boiler) => {
      this.boiler = boiler;
      this.temperature = this.boiler.currentWaterTemp;
    });
  }

  private async updateCurrentConsumption() {
    axios.get(`${this.upstreamPowerMeter}/report`).then((result) => {
      const data = result.data!;
      this.relay0 = data!.relay;
      if (data!.power && data!.relay == true) {
        this.powerMeter0 = data.power;
      }
    });
  }

  protected _getHttpSettings() {
    return {
      sensors: {
        temperature_threshold: 1,
        temperature_unit: 'C',
      },
      relays: [this._getRelay0HttpSettings()],
      meters: [this._getPowerMeter0HttpSettings()],
      ext_sensors: {
        temperature_unit: 'C',
      },
      ext_temperature: {
        0: {
          overtemp_threshold_tC: 25.6,
          overtemp_threshold_tF: 78.1,
          undertemp_threshold_tC: 18.4,
          undertemp_threshold_tF: 65.1,
          overtemp_act: 'disabled',
          undertemp_act: 'disabled',
          offset_tC: 0,
          offset_tF: 0,
        },
      },
    };
  }

  protected _getHttpStatus() {
    return {
      relays: [this._getRelay0HttpStatus()],
      meters: [this._getPowerMeter0HttpStatus()],
      tmp: {
        value: this.temperature,
        units: 'C',
        tC: this.temperature,
        tF: (this.temperature * 9) / 5 + 32,
        is_valid: true,
      },
      ext_sensors: {
        temperature_unit: 'C',
      },
      ext_temperature: {
        0: {
          hwID: 0,
          tC: this.temperature,
          tF: (this.temperature * 9) / 5 + 32,
        },
      },
    };
  }
}

let boiler;

try {
  boiler = new OekboilerShelly(mac);
  console.log(
    `▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
██░▄▄▄░█░▄▄█░█▀█▀▄▄▀█░▄▄▀█▀▄▄▀██▄██░██░▄▄█░▄▄▀███░█░████░▄▄▄░█░████░▄▄█░██░██░██░██
██░███░█░▄▄█░▄▀█░██░█░▄▄▀█░██░██░▄█░██░▄▄█░▀▀▄███▀▄▀████▄▄▄▀▀█░▄▄░█░▄▄█░██░██░▀▀░██
██░▀▀▀░█▄▄▄█▄█▄██▄▄██▄▄▄▄██▄▄██▄▄▄█▄▄█▄▄▄█▄█▄▄███▄█▄████░▀▀▀░█▄██▄█▄▄▄█▄▄█▄▄█▀▀▀▄██
▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀`,
  );
  console.log('------------------------------');
  console.log('Shelly:     ', boiler.type);
  console.log('ID:         ', boiler.id);
  console.log('Boiler:     ', boiler.dsn);
  console.log('PowerMeter: ', boiler.upstreamPowerMeter);
  console.log('PV Switch:  ', boiler.upstreamPVSwitch);
  console.log('------------------------------');
  console.log('');

  const coapServer = new CoapServer(boiler);
  const httpServer = new HttpServer(boiler);

  coapServer
    .start()
    .then(() => {
      console.log('CoAP server started');
    })
    .catch((error) => {
      console.error('Failed to start CoAP server:', error);
    });

  httpServer
    .start()
    .then(() => {
      console.log('HTTP server started');
    })
    .catch((error) => {
      console.error('Failed to start HTTP server:', error);
    });
} catch (e: unknown) {
  if (e instanceof Error) console.error('Failed to create device:', e.message);
}
