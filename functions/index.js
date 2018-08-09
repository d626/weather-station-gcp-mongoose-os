const functions = require('firebase-functions');
const admin = require('firebase-admin');
const bigquery = require('@google-cloud/bigquery')();
const cors = require('cors')({ origin: true });

admin.initializeApp(functions.config().firebase);

const db = admin.database();

/**
 * Receive data from pubsub, then 
 * Write telemetry raw data to bigquery
 * Maintain last data on firebase realtime database
 */
exports.receiveTelemetry = functions.pubsub
  .topic('telemetry-topic')
  .onPublish((message, context) => {
    const attributes = message.attributes;
    const payload = message.json;

    const deviceId = attributes['deviceId'];

    const data = {
      humidity: payload.hum,
      temp: payload.temp,
      deviceId: deviceId,
      timestamp: context.timestamp
    };
  
    if (
      payload.hum < 0 ||
      payload.hum > 100 ||
      payload.temp > 100 ||
      payload.temp < -50
    ) {
      // Validate and do nothing
      return;
    }

    return Promise.all([
      insertIntoBigquery(data),
      updateCurrentDataFirebase(data)
    ]);
  });

/** 
 * Maintain last status in firebase
*/
function updateCurrentDataFirebase(data) {
  return db.ref(`/devices/${data.deviceId}`).set({
    humidity: data.humidity,
    temp: data.temp,
    lastTimestamp: data.timestamp
  });
}

/**
 * Store all the raw data in bigquery
 */
function insertIntoBigquery(data) {
  // TODO: Make sure you set the `bigquery.datasetname` Google Cloud environment variable.
  const dataset = bigquery.dataset(functions.config().bigquery.datasetname);
  // TODO: Make sure you set the `bigquery.tablename` Google Cloud environment variable.
  const table = dataset.table(functions.config().bigquery.tablename);

  return table.insert(data);
}

/**
 * Receive data from pubsub, then 
 * Write telemetry raw data to bigquery
 * Maintain last data on firebase realtime database
 */
exports.receiveThingyTelemetry = functions.pubsub
  .topic('thingy-topic')
  .onPublish((message, context) => {
    const attributes = message.attributes;
    const payload = message.json;

    const deviceId = attributes['deviceId'];

    const message_type = payload.type;

    let data = {
      deviceId: deviceId,
      timestamp: context.timestamp
    };

    switch (message_type) {
      case "temperature":
        data.temperature = Number("" + payload.data.integer + "." + payload.data.decimal);
        break;
      case "pressure":
        data.pressure = Number("" + payload.data.integer + "." + payload.data.decimal);
        break;
      case "humidity":
        const humidity = payload.data.humidity;
        if (humidity < 0 || humidity > 100) {
          console.log("Invalid humidity value: " + humidity);
          return;
        }
        data.humidity = payload.data.humidity;
        break;
      case "gas":
        data.eco2_ppm = payload.data.eco2_ppm;
        data.tvoc_ppb = payload.data.tvoc_ppb;
        break;
      case "color":
        data.red = payload.data.red;
        data.green = payload.data.green;
        data.blue = payload.data.blue;
        data.clear = payload.data.clear;
        break;
      default:
        console.log(payload);
        console.log("Invalid message");
        return;
    };

    return Promise.all([
      insertIntoThingyBigquery(data, message_type + "_table"),
      updateCurrentThingyDataFirebase(data, message_type)
    ]);
  });

/** 
 * Maintain last status in firebase
*/
function updateCurrentThingyDataFirebase(data, type) {
  let dbRef = db.ref(`/sensor/${type}/${data.deviceId}`);
  switch (type) {
    case "temperature":
      return dbRef.set({
        lastTimestamp: data.timestamp,
        temperature: data.temperature
      });
    case "pressure":
      return dbRef.set({
        lastTimestamp: data.timestamp,
        pressure: data.pressure
      });
    case "humidity":
      return dbRef.set({
        lastTimestamp: data.timestamp,
        humidity: data.humidity
      });
    case "gas":
      return dbRef.set({
        lastTimestamp: data.timestamp,
        eco2_ppm: data.eco2_ppm,
        tvoc_ppb: data.tvoc_ppb
      });
    case "color":
      return dbRef.set({
        lastTimestamp: data.timestamp,
        red: data.red,
        green: data.green,
        blue: data.blue,
        clear: data.clear
      });
    default:
      console.log("Unknown sensor type to be updated in Firebase RealTime Database");
      console.log(type);
      return;
  }
}

/**
 * Store all the raw data in bigquery
 */
function insertIntoThingyBigquery(data, tablename) {
  // TODO: Make sure you set the `bigquery.datasetname` Google Cloud environment variable.
  const dataset = bigquery.dataset("thingy_dataset");
  // TODO: Make sure you set the `bigquery.tablename` Google Cloud environment variable.
  const table = dataset.table(tablename);

  return table.insert(data);
}

/**
 * Query bigquery with the last 7 days of data
 * HTTPS endpoint to be used by the webapp
 */
exports.getReportData = functions.https.onRequest((req, res) => {
  const table = '`' + functions.config().project.id + '.' 
                    + functions.config().bigquery.datasetname + '.'
                    + functions.config().bigquery.tablename + '`';

  const query = `
    SELECT 
      TIMESTAMP_TRUNC(data.timestamp, SECOND, 'America/Cuiaba') data_hora,
      avg(data.temp) as avg_temp,
      avg(data.humidity) as avg_hum,
      min(data.temp) as min_temp,
      max(data.temp) as max_temp,
      min(data.humidity) as min_hum,
      max(data.humidity) as max_hum,
      count(*) as data_points      
    FROM ${table} data
    WHERE data.timestamp between timestamp_sub(current_timestamp, INTERVAL 1 HOUR) and current_timestamp()
    group by data_hora
    order by data_hora
  `;

  return bigquery
    .query({
      query: query,
      useLegacySql: false
    })
    .then(result => {
      const rows = result[0];

      cors(req, res, () => {
        res.json(rows);
      });
    });
});

/**
 * Query bigquery with the last 7 days of data
 * HTTPS endpoint to be used by the webapp
 */
exports.getTempData = functions.https.onRequest((req, res) => {
  const table = '`' + functions.config().project.id + '.' 
                    + 'thingy_dataset' + '.'
                    + 'temperature_table' + '`';

  const query = `
    SELECT 
      TIMESTAMP_TRUNC(data.timestamp, SECOND, 'UTC') data_hora,
      avg(data.temperature) as avgTemp,
      count(*) as data_points      
    FROM ${table} data
    WHERE data.timestamp between timestamp_sub(current_timestamp, INTERVAL 1 MINUTE) and current_timestamp()
    group by data_hora
    order by data_hora
  `;

  return bigquery
    .query({
      query: query,
      useLegacySql: false
    })
    .then(result => {
      const rows = result[0];

      cors(req, res, () => {
        res.json(rows);
      });
    });
});

/**
 * Query bigquery with the last 7 days of data
 * HTTPS endpoint to be used by the webapp
 */
exports.getGasData = functions.https.onRequest((req, res) => {
  const table = '`' + functions.config().project.id + '.' 
                    + 'thingy_dataset' + '.'
                    + 'gas_table' + '`';

  const query = `
    SELECT 
      TIMESTAMP_TRUNC(data.timestamp, SECOND, 'UTC') data_hora,
      avg(data.eco2_ppm) as avgCO2,
      avg(data.tvoc_ppb) as avgOrg,
      count(*) as data_points      
    FROM ${table} data
    WHERE data.timestamp between timestamp_sub(current_timestamp, INTERVAL 1 MINUTE) and current_timestamp()
    group by data_hora
    order by data_hora
  `;

  return bigquery
    .query({
      query: query,
      useLegacySql: false
    })
    .then(result => {
      const rows = result[0];

      cors(req, res, () => {
        res.json(rows);
      });
    });
});

/**
 * Query bigquery with the last 7 days of data
 * HTTPS endpoint to be used by the webapp
 */
exports.getHumData = functions.https.onRequest((req, res) => {
  const table = '`' + functions.config().project.id + '.' 
                    + 'thingy_dataset' + '.'
                    + 'humidity_table' + '`';

  const query = `
    SELECT 
      TIMESTAMP_TRUNC(data.timestamp, SECOND, 'UTC') data_hora,
      avg(data.humidity) as avgHum,
      count(*) as data_points      
    FROM ${table} data
    WHERE data.timestamp between timestamp_sub(current_timestamp, INTERVAL 1 MINUTE) and current_timestamp()
    group by data_hora
    order by data_hora
  `;

  return bigquery
    .query({
      query: query,
      useLegacySql: false
    })
    .then(result => {
      const rows = result[0];

      cors(req, res, () => {
        res.json(rows);
      });
    });
});