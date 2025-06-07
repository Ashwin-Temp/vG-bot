const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const moment = require('moment-timezone');

const chartJSNodeCanvas = new ChartJSNodeCanvas({ width: 800, height: 400 });

// Line chart for today's trend


async function generateTrendTodayGraph(data, title = 'Player Activity Trend (Today)') {

    const labels = data.map(entry => {

        try {
            // Apply the correct time zone (UTC+1) and format to 'HH:mm'
            // Adding 1 hour to UTC time for UTC+1
            return moment(entry.timestamp).utcOffset('+05:30').format('HH:mm');  // Adjust UTC to UTC+1
        } catch (error) {
            console.log('Error formatting timestamp:', entry.timestamp, error);
            return moment(entry.timestamp).utc().format('HH:mm');
        }
    });

    const counts = data.map(entry => entry.playerCount);

    const config = {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Players Online',
                data: counts,
                fill: false,
                borderColor: '#00FF00',
                backgroundColor: 'rgba(0, 255, 0, 0.6)',
                tension: 0.3,
                pointRadius: 6,
                pointHoverRadius: 8,
            }]
        },
        options: {
            plugins: {
                title: {
                    display: true,
                    text: title,
                    font: {
                        size: 22,
                        weight: 'bold',
                    },
                    color: '#FFFFFF',
                },
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Time',
                        color: '#FFFFFF',
                        font: { size: 18, weight: 'bold' }
                    },
                    ticks: {
                        color: '#FFFFFF',
                        font: { size: 16, weight: 'bold' }
                    }
                },
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Players',
                        color: '#FFFFFF',
                        font: { size: 18, weight: 'bold' }
                    },
                    ticks: {
                        stepSize: 2,
                        color: '#FFFFFF',
                        font: { size: 16, weight: 'bold' }
                    }
                }
            }
        }
    };

    return await chartJSNodeCanvas.renderToBuffer(config);
}



module.exports = { generateTrendTodayGraph};
