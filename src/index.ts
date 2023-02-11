/**
 * Little script to merge (or fake) an Heatpump Boiler as a Shelly 1
 * with temperature sensors
 *
 * To use it, define the following three environment variables:
 *
 * OB_USER_MAIL: your Oekoboiler E-Mail
 * OB_USER_PASSWORD: your Oekoboiler Password
 * OB_DSN: The DSN of your Oekoboiler
 * OB_MYSTROM_METER: The MyStrom Switch used as a power meter for the Oekoboiler
 * OB_SHELLY_SWITCH: The Shelly 1 used to control the Oekoboiler's PV function
 * OB_LISTEN_IP: The IP address to bind to (will be '0.0.0.0' if undefined)
 *
 * If you're unsure about the DSN, have a look at `oekoboiler-api`
 * and the example provided therein to get all your Boiler's DSNs
 */
import axios from 'axios';
import { Retryable, BackOffPolicy } from 'typescript-retry-decorator';
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
        `${this.upstreamPVSwitch}/relay/0?turn=${
          newValue === true ? 'on' : 'off'
        }`,
      );
    });

    // Define Temperature property
    this._defineProperty('temperature', 0, null, Number);

    // Update consumption, temperature and pv switch from source devices
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

    this.updateCurrentPVStatus().then(() => {
      // Set an interval to update the relay status
      setInterval(() => {
        // Device will emit changed values
        this.updateCurrentPVStatus();
      }, (interval / 3) * 1000);
    });
  }

  // fetch current temperature from Oekboiler API
  @Retryable({
    maxAttempts: 3,
    backOffPolicy: BackOffPolicy.ExponentialBackOffPolicy,
    backOff: 1000,
    exponentialOption: { maxInterval: 4000, multiplier: 3 },
  })
  private async updateCurrentTemperature() {
    await this.api.getBoiler(this.dsn).then((boiler) => {
      this.boiler = boiler;
      this.temperature = this.boiler.currentWaterTemp;
    });
  }

  // fetch current power consumption from Power Meter
  @Retryable({
    maxAttempts: 3,
    backOffPolicy: BackOffPolicy.ExponentialBackOffPolicy,
    backOff: 1000,
    exponentialOption: { maxInterval: 4000, multiplier: 3 },
  })
  private async updateCurrentConsumption() {
    axios
      .get(`${this.upstreamPowerMeter}/report`)
      .then((result) => {
        const data = result.data!;
        if (data!.power) {
          this.powerMeter0 = data.power;
        }
      })
      .catch((error) => {
        if (error.request) {
          // Handle error (e.g. not reachable) "gracefully"
          console.error(`Request error: ${error.message}`);
        }
      });
  }

  // fetch current relay status from PV relay
  @Retryable({
    maxAttempts: 3,
    backOffPolicy: BackOffPolicy.ExponentialBackOffPolicy,
    backOff: 1000,
    exponentialOption: { maxInterval: 4000, multiplier: 3 },
  })
  private async updateCurrentPVStatus() {
    axios
      .get(`${this.upstreamPVSwitch}/relay/0`)
      .then((result) => {
        const data = result.data!;
        this.relay0 = data.ison;
      })
      .catch((error) => {
        if (error.request) {
          // Handle error (e.g. not reachable) "gracefully"
          console.error(`Request error: ${error.message}`);
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
      ext_temperature: {},
    };
  }

  protected _getHttpStatus() {
    return {
      relays: [this._getRelay0HttpStatus()],
      meters: [this._getPowerMeter0HttpStatus()],
      tmp: {},
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
  console.log('Listen IP:  ', process.env.OB_LISTEN_IP || 'all ip addresses');
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
    .start(process.env.OB_LISTEN_IP)
    .then(() => {
      console.log(
        `HTTP server started on ${
          process.env.OB_LISTEN_IP || 'all ip addresses'
        }`,
      );
    })
    .catch((error) => {
      console.error('Failed to start HTTP server:', error);
    });
} catch (e) {
  if (e instanceof Error) console.error('Failed to create device:', e.message);
}
