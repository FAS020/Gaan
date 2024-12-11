const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid'); // Nodig om unieke IDs te genereren

// Maak een HTTP-server om de WebSocket-server te draaien
const server = http.createServer((req, res) => {
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './index.html'; // Als de root wordt aangevraagd, serveer index.html
    }

    const extname = path.extname(filePath);
    let contentType = 'text/html';

    // Stel content type in op basis van bestandstype
    if (extname === '.js') {
        contentType = 'application/javascript';
    } else if (extname === '.css') {
        contentType = 'text/css';
    } else if (extname === '.png') {
        contentType = 'image/png';
    } else if (extname === '.svg') {
        contentType = 'image/svg+xml';
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            return res.end('404 Not Found');
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        }
    });
});

// WebSocket-server opzetten
const wss = new WebSocket.Server({ server });

// Houd bij wie de banaan heeft
let currentBanaanHolder = null;
let currentBanaanHolderId = null; // Identificeer de houder op basis van unieke ID
let currentBanaanHolderLocation = null; // Bewaar de locatie van de banaan-houder

// Wanneer een nieuwe WebSocket-verbinding wordt gemaakt
wss.on('connection', (ws) => {
    const clientId = uuidv4(); // Genereer een unieke ID voor deze client
    ws.clientId = clientId;
    console.log(`Nieuw apparaat verbonden met ID: ${clientId}`);

    // Stuur de juiste afbeelding naar de nieuwe client
    if (!currentBanaanHolder) {
        // Eerste gebruiker krijgt de echte banaan
        currentBanaanHolder = ws;
        currentBanaanHolderId = clientId;
        ws.send(JSON.stringify({ showImage: true, image: 'banaan.png' }));
    } else {
        // Andere gebruikers krijgen de grijze banaan
        ws.send(JSON.stringify({ showImage: true, image: 'banaan-grijs.png' }));
    }

    // Ontvang locatie-informatie van de gebruikers
    ws.on('message', (message) => {
        const data = JSON.parse(message);

        // Update locatie van huidige banaan-houder
        if (data.latitude && data.longitude) {
            if (ws === currentBanaanHolder) {
                currentBanaanHolderLocation = { latitude: data.latitude, longitude: data.longitude };
            }

            // Controleer of een andere client dichtbij is
            wss.clients.forEach((client) => {
                if (client !== ws && client.readyState === WebSocket.OPEN && currentBanaanHolderLocation) {
                    const distance = calculateDistance(
                        data.latitude,
                        data.longitude,
                        currentBanaanHolderLocation.latitude,
                        currentBanaanHolderLocation.longitude
                    );

                    // Als ze dichtbij genoeg zijn, wissel de banaan
                    if (distance < 50) { // 50 meter als voorbeeld
                        console.log(`Client ${client.clientId} dichtbij, geef de banaan door`);
                        // Update huidige houder: stuur hen de grijze banaan
                        currentBanaanHolder.send(JSON.stringify({ showImage: true, image: 'banaan-grijs.png' }));

                        // Stel de nieuwe houder in
                        currentBanaanHolder = client;
                        currentBanaanHolderId = client.clientId;
                        currentBanaanHolderLocation = { latitude: data.latitude, longitude: data.longitude };

                        // Stuur de echte banaan naar de nieuwe houder
                        currentBanaanHolder.send(JSON.stringify({ showImage: true, image: 'banaan.png' }));
                    }
                }
            });
        }
    });

    // Verwijder de WebSocket wanneer de verbinding wordt gesloten
    ws.on('close', () => {
        console.log(`Apparaat met ID ${ws.clientId} is disconnected`);

        // Als de huidige houder disconnect, reset de houder
        if (ws === currentBanaanHolder) {
            currentBanaanHolder = null;
            currentBanaanHolderId = null;
            currentBanaanHolderLocation = null;

            // Wijs de banaan aan een nieuwe willekeurige client toe
            const availableClients = Array.from(wss.clients).filter(client => client.readyState === WebSocket.OPEN);
            if (availableClients.length > 0) {
                const newHolder = availableClients[0];
                currentBanaanHolder = newHolder;
                currentBanaanHolderId = newHolder.clientId;
                newHolder.send(JSON.stringify({ showImage: true, image: 'banaan.png' }));
            }
        }
    });
});

// Bereken de afstand tussen twee GPS-coördinaten (in meter)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius van de aarde in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c * 1000; // Afstand in meters
    return distance;
}

// Start de server op poort 8080
server.listen(8080, () => {
    console.log('Server draait op http://localhost:8080');
});
