#!/bin/bash

# BlueCollar Monitoring Stack Startup Script
# Sets up and starts all monitoring infrastructure

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEPLOY_DIR="$PROJECT_ROOT/deploy"

echo "🚀 Starting BlueCollar Monitoring Infrastructure..."
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Check if Docker is running
echo -e "${BLUE}[1/5]${NC} Checking Docker..."
if ! docker ps > /dev/null 2>&1; then
  echo -e "${YELLOW}✗ Docker is not running. Please start Docker and try again.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Docker is running${NC}"
echo ""

# 2. Check if environment file exists
echo -e "${BLUE}[2/5]${NC} Checking environment configuration..."
if [ ! -f "$DEPLOY_DIR/monitoring/.env" ]; then
  echo -e "${YELLOW}⚠ .env file not found. Creating from example...${NC}"
  cp "$DEPLOY_DIR/monitoring/.env.example" "$DEPLOY_DIR/monitoring/.env"
  echo -e "${YELLOW}✓ .env created. Please configure:${NC}"
  echo "  - SLACK_WEBHOOK_URL"
  echo "  - PAGERDUTY_SERVICE_KEY"
  echo "  - SMTP credentials"
  echo "  - Database credentials"
  echo ""
  echo "  Edit: $DEPLOY_DIR/monitoring/.env"
  echo ""
fi

# 3. Create network if it doesn't exist
echo -e "${BLUE}[3/5]${NC} Setting up Docker network..."
if ! docker network inspect bluecollar-network > /dev/null 2>&1; then
  docker network create bluecollar-network
  echo -e "${GREEN}✓ Created bluecollar-network${NC}"
else
  echo -e "${GREEN}✓ bluecollar-network already exists${NC}"
fi
echo ""

# 4. Load environment variables
echo -e "${BLUE}[4/5]${NC} Loading environment configuration..."
set -a
source "$DEPLOY_DIR/monitoring/.env"
set +a
echo -e "${GREEN}✓ Environment loaded${NC}"
echo ""

# 5. Start monitoring stack
echo -e "${BLUE}[5/5]${NC} Starting monitoring services..."
echo "Services to start:"
echo "  - Prometheus"
echo "  - AlertManager"
echo "  - Grafana"
echo "  - Jaeger"
echo "  - OpenTelemetry Collector"
echo "  - PostgreSQL Exporter"
echo "  - Redis Exporter"
echo "  - Node Exporter"
echo "  - Logstash"
echo "  - Elasticsearch"
echo ""

cd "$DEPLOY_DIR"
docker-compose -f docker-compose.monitoring.yml up -d

echo ""
echo -e "${GREEN}✓ Monitoring stack started!${NC}"
echo ""

# Wait for services to be ready
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check health
PROMETHEUS_HEALTH=$(docker ps | grep bluecollar-prometheus | wc -l)
GRAFANA_HEALTH=$(docker ps | grep bluecollar-grafana | wc -l)
JAEGER_HEALTH=$(docker ps | grep bluecollar-jaeger | wc -l)

if [ "$PROMETHEUS_HEALTH" -gt 0 ] && [ "$GRAFANA_HEALTH" -gt 0 ] && [ "$JAEGER_HEALTH" -gt 0 ]; then
  echo -e "${GREEN}✓ All services started${NC}"
else
  echo -e "${YELLOW}✗ Some services failed to start. Check logs:${NC}"
  echo "  docker-compose -f deploy/docker-compose.monitoring.yml logs"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "${GREEN}Monitoring Dashboard URLs:${NC}"
echo ""
echo "  📊 Prometheus    http://localhost:9090"
echo "  🔔 AlertManager  http://localhost:9093"
echo "  📈 Grafana       http://localhost:3001  (admin/admin)"
echo "  🔍 Jaeger        http://localhost:16686"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "${GREEN}Next steps:${NC}"
echo ""
echo "  1. Access Grafana at http://localhost:3001"
echo "  2. Change default admin password"
echo "  3. View pre-configured dashboards"
echo "  4. Configure alert notification channels"
echo "  5. Test metrics endpoint: curl http://localhost:3000/metrics"
echo ""
echo "📖 Full documentation: docs/MONITORING_SETUP.md"
echo ""
