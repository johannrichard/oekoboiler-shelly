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
import { CoapServer, HttpServer } from 'fake-shelly';
import { Shelly1 } from 'fake-shelly/devices';
import { OekoboilerApi, OekoboilerDevice } from 'oekoboiler-api';

const mac = '00404F74DE83';
const interval = 30;

class OekboilerShelly extends Shelly1 {
  private api = new OekoboilerApi(
    process.env.OB_USER_MAIL || '',
    process.env.OB_USER_PASSWORD || '',
  );
  private boiler: OekoboilerDevice | undefined = undefined;

  constructor(id: string) {
    super(id);

    this._defineProperty('temperature', 0, null, Number);
    this.getCurrentTemperature().then(() => {
      console.log(this.boiler);
      // Set an interval to update the temperature
      setInterval(() => {
        this.getCurrentTemperature().then(() => {
          if (this.boiler) {
            console.log(`Current temperature: ${this.boiler.currentWaterTemp}`);
          }
        });
      }, interval * 1000);
    });
  }

  private async getCurrentTemperature() {
    await this.api.getBoiler(process.env.OB_DSN || '').then((boiler) => {
      this.boiler = boiler;
      this.temperature = this.boiler.currentWaterTemp;
    });
  }
  protected _getHttpSettings() {
    return {
      sensors: {
        temperature_threshold: 1,
        temperature_unit: 'C',
      },
      relays: [this._getRelay0HttpSettings()],
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

  _getHttpStatus() {
    return {
      relays: [this._getRelay0HttpStatus()],
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

let device;

try {
  device = new OekboilerShelly(mac);
  console.log('------------------------------');
  console.log('Type:', device.type);
  console.log('ID:', device.id);
  console.log('------------------------------');
  console.log('');

  const coapServer = new CoapServer(device);
  const httpServer = new HttpServer(device);

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
