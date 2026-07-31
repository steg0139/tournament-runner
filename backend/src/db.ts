import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  DeleteCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { Tournament } from './types';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.DYNAMODB_TABLE || 'TournamentRunner';

export async function createTournament(tournament: Tournament): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `TOURNAMENT#${tournament.id}`,
        SK: 'META',
        ...tournament,
      },
    })
  );
}

export async function getTournament(id: string): Promise<Tournament | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `TOURNAMENT#${id}`,
        SK: 'META',
      },
    })
  );

  if (!result.Item) return null;

  const { PK, SK, ...tournament } = result.Item;
  return tournament as Tournament;
}

export async function updateTournament(tournament: Tournament): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `TOURNAMENT#${tournament.id}`,
        SK: 'META',
        ...tournament,
      },
    })
  );
}

export async function deleteTournament(id: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `TOURNAMENT#${id}`,
        SK: 'META',
      },
    })
  );
}

export async function listTournaments(): Promise<Tournament[]> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'SK = :sk',
      ExpressionAttributeValues: {
        ':sk': 'META',
      },
    })
  );

  return (result.Items || []).map((item) => {
    const { PK, SK, ...tournament } = item;
    return tournament as Tournament;
  });
}
