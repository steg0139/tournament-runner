import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  DeleteCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { Tournament, MultiStageTournament, AnyTournament } from './types';

const client = new DynamoDBClient({});

const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const TABLE_NAME = process.env.DYNAMODB_TABLE || 'TournamentRunner';

export function isMultiStage(t: AnyTournament): t is MultiStageTournament {
  return t.type === 'multi_stage';
}

export async function createTournament(tournament: AnyTournament): Promise<void> {
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

export async function getTournament(id: string): Promise<AnyTournament | null> {
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
  return tournament as AnyTournament;
}

export async function updateTournament(tournament: AnyTournament): Promise<void> {
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

export async function listTournaments(): Promise<AnyTournament[]> {
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
    return tournament as AnyTournament;
  });
}
