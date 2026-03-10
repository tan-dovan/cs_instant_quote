# CloudSigma Pricing Calculator

Dynamic cloud pricing calculator that compares CloudSigma pricing against AWS, Azure, and GCP in real time.

## Features
- **Live pricing** from CloudSigma API (18 locations)
- **Dynamic comparison** against AWS, Azure, GCP (nearest region per country)
- **Resource sliders**: CPU, RAM, SSD, IPs, bandwidth, VLANs
- **Currency normalization** to USD for fair comparison
- **TaaS-style dark branding**

## Local Development

```bash
npm install
npm start
# Open http://localhost:8080
```

## Deploy on CloudSigma NEXT VM

### 1. Create a VM on https://next.cloudsigma.com
- Ubuntu 22.04 or later
- 1 vCPU, 1 GB RAM, 10 GB SSD is enough
- Attach a public IP
- Open port 8080 in firewall

### 2. SSH into the VM and install Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 3. Deploy the app
```bash
sudo mkdir -p /opt/cloudsigma-pricing
# Copy project files to /opt/cloudsigma-pricing/
cd /opt/cloudsigma-pricing
npm install --production
```

### 4. Setup systemd service
```bash
sudo cp deploy/cloudsigma-pricing.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable cloudsigma-pricing
sudo systemctl start cloudsigma-pricing
```

### 5. Verify
```bash
curl http://localhost:8080/api/locations
# Open http://<VM-PUBLIC-IP>:8080 in browser
```

## API Endpoints
| Endpoint | Description |
|---|---|
| `GET /api/locations` | CloudSigma cloud locations |
| `GET /api/pricing/:host` | Pricing for a specific location (e.g. `zrh.cloudsigma.com`) |
| `GET /api/competitors/:cc` | AWS/Azure/GCP pricing for a country code (e.g. `CH`) |
| `GET /api/competitors` | All competitor pricing data |

## Architecture
```
Browser → Node.js proxy (Express) → CloudSigma API
                                  → Static competitor data (curated)
```
