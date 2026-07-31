# Tournament Runner 🏆

A web app for running basketball and cornhole tournaments. Supports single elimination, double elimination, round robin, and Swiss formats.

## Project Structure

```
├── backend/          # Express + Lambda + DynamoDB
│   └── src/
│       ├── index.ts      # Express app + Lambda handler
│       ├── routes.ts     # API routes
│       ├── brackets.ts   # Bracket generation logic
│       ├── db.ts         # DynamoDB operations
│       └── types.ts      # Shared types
├── frontend/         # React + Vite + Tailwind
│   └── src/
│       ├── api/          # API client + types
│       ├── components/   # Bracket, RoundRobin, ScoreModal
│       └── pages/        # Home, Create, Tournament
└── template.yaml     # SAM template for AWS deployment
```

## Local Development

### Backend
```bash
cd backend
npm install
npm run dev
# Runs on http://localhost:3001
```

Note: For local dev, you'll need AWS credentials configured (or DynamoDB Local).

### Frontend
```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:5173, proxies /api to :3001
```

## Deploying to AWS

### Prerequisites
- AWS SAM CLI installed
- AWS credentials configured

### Deploy
```bash
# Build backend
cd backend && npm run build && cd ..

# Build frontend
cd frontend && npm run build && cd ..

# Deploy infrastructure
sam build
sam deploy --guided

# After deploy, update frontend API URL:
# Edit frontend/src/api/client.ts BASE_URL to your API Gateway URL

# Upload frontend to S3
aws s3 sync frontend/dist s3://<FrontendBucketName> --delete
```

## API Endpoints

- `GET /api/tournaments` - List all tournaments
- `POST /api/tournaments` - Create a tournament
- `GET /api/tournaments/:id` - Get tournament details
- `PUT /api/tournaments/:id/matches/:matchId/score` - Update match score
- `POST /api/tournaments/:id/swiss/next-round` - Generate next Swiss round
- `DELETE /api/tournaments/:id` - Delete a tournament
