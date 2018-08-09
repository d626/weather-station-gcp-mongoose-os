document.addEventListener('DOMContentLoaded', function() {
  const db = firebase.database();

  // Create listeners
  const sensorsRef = db.ref('/sensor');

  // Register functions that update with last devices state
  sensorsRef.on('value', function(snapshot) {
    let sensors = snapshot.val();
    let showedDevices = [];

    console.log(sensors);
    let sensorsEl = document.getElementById('sensors');
    sensorsEl.innerHTML = '';

    let deviceRow = document.createElement("tr");
    
    deviceRow.setAttribute("id","deviceRow");    
    sensorsEl.appendChild(deviceRow);

    deviceRow = document.getElementById('deviceRow');

    let emptyCell = document.createElement("th");
    deviceRow.appendChild(emptyCell);

    for (var sensorType in sensors) {

      let tr = document.createElement('tr');
      let th = document.createElement('th');
      
      th.innerHTML = `${sensorType}`;
      tr.appendChild(th);

      let devices = snapshot.child(sensorType).val();

      for(var device in devices) {
        let parameters = snapshot.child(sensorType).child(device).val();
        

        th = document.createElement('th');

        if(!showedDevices.includes(device)) {
          let thDevice = document.createElement('th');
          thDevice.innerHTML = `|${device}|`
          deviceRow.appendChild(thDevice);

          showedDevices.push(device);
        }

        for(var values in parameters) {
          if(values != 'lastTimestamp') {
            th.innerHTML += `|${parameters[values]}| `;   
          }       
        }
        
        tr.appendChild(th);
      }
      sensorsEl.appendChild(tr);
    }
    
  });
  fetchTempData(); //Initial report build
  fetchHumData();
  fetchGasData();
});

const reportDataUrl = '/getReportData';
const tempDataUrl = '/getTempData';
const humDataUrl = '/getHumData';
const gasDataUrl = '/getGasData';
var tempChart;
var humChart;
var cO2Chart;
var orgChart;
var chartsAreBuilt = false;

function fetchReportData() {
  try {
    fetch(reportDataUrl)
      .then(res => res.json())
      .then(rows => {
        var maxTempData = rows.map(row => row.max_temp);
        var avgTempData = rows.map(row => row.avg_temp);
        var minTempData = rows.map(row => row.min_temp);

        var maxHumData = rows.map(row => row.max_hum);
        var avgHumData = rows.map(row => row.avg_hum);
        var minHumData = rows.map(row => row.min_hum);

        var labels = rows.map(row => row.data_hora.value);
        if(!chartsAreBuilt) {
          tempChart = buildLineChart(
              'tempLineChart',
              'Temperature in C°',
              labels,
              '#E64D3D',
              avgTempData
            );
          humChart = buildLineChart(
              'humLineChart',
              'Humidity in %',
              labels,
              '#0393FA',
              avgHumData
            );
          chartsAreBuilt = true;
        } else {
          console.log("Updating charts.")
          addData(tempChart, labels[labels.length-1], avgTempData[avgTempData.length - 1]);
          addData(humChart, labels[labels.length-1], avgHumData[avgHumData.length - 1]);
          addData(pressureChart, labels[labels.length-1], avgPressureData[avgPressureData.length - 1]);
          addData(c02Chart, labels[labels.length-1], avgC02Data[avgC02Data.length - 1]);
        }
      });
  } catch (e) {
    alert('Error getting report data');
  }
}

function fetchTempData() {
  try {
    fetch(tempDataUrl)
      .then(res => res.json())
      .then(rows => {
        var avgTempData = rows.map(row => row.avgTemp);

        var labels = rows.map(row => row.data_hora.value);
          tempChart = buildLineChart(
              'tempLineChart',
              'Temperature in C°',
              labels,
              '#E64D3D',
              avgTempData
            );
      });
  } catch (e) {
    alert('Error getting report data');
  }
}

function fetchHumData() {
  try {
    fetch(humDataUrl)
      .then(res => res.json())
      .then(rows => {
        var avgHumData = rows.map(row => row.avgHum);

        var labels = rows.map(row => row.data_hora.value);
          humChart = buildLineChart(
              'humLineChart',
              'Humitidy in %',
              labels,
              '#E64D3F',
              avgHumData
            );
      });
  } catch (e) {
    alert('Error getting report data');
  }
}

function fetchGasData() {
  try {
    fetch(gasDataUrl)
      .then(res => res.json())
      .then(rows => {
        var avgC02Data = rows.map(row => row.avgC02);
        var avgOrgData = rows.map(row => row.avgOrg);

        var labels = rows.map(row => row.data_hora.value);
          orgChart = buildLineChart(
              'c02LineChart',
              'C02 concentration in ppm',
              labels,
              '#E64D3A',
              avgC02Data
            );
          orgChart = buildLineChart(
              'orgLineChart',
              'Organic component concentration in ppb',
              labels,
              '#E64D3C',
              avgOrgData
          );
      });
  } catch (e) {
    alert('Error getting report data');
  }
}

// Constroi um gráfico de linha no elemento (el) com a descrição (label) e os
// dados passados (data)
function buildLineChart(el, label, labels, color, avgData) {
  const elNode = document.getElementById(el);
  var chart = new Chart(elNode, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: label,
          data: avgData,
          borderWidth: 1,
          fill: true,
          spanGaps: true,
          lineTension: 0.2,
          backgroundColor: color,
          borderColor: '#3A4250',
          pointRadius: 2
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        xAxes: [
          {
            type: 'time',
            distribution: 'series',
            ticks: {
              source: 'labels'
            }
          }
        ],
        yAxes: [
          {
            scaleLabel: {
              display: true,
              labelString: label
            },
            ticks: {
              stepSize: 0.5
            }
          }
        ]
      }
    }
  });

  const progressEl = document.getElementById(el + '_progress');
  progressEl.remove();

  return chart;
}

function addData(chart, label, data) {
  chart.data.labels.push(label);
  chart.data.datasets.forEach((dataset) => {
      dataset.data.push(data);
  });
  chart.update();
}
