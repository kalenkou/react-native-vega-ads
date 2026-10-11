import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { CounterPort } from './collector';

/*
 * Real DynamoDB adapter. Table: partition key `day` (string, YYYY-MM-DD), sort key `key`
 * (string, "<ad>#<event>"), attribute `count` (number). Credentials come from the Lambda role.
 */
export function dynamoCounters(tableName: string): CounterPort {
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  return {
    add: async (day, key) => {
      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { day, key },
          UpdateExpression: 'ADD #count :one',
          ExpressionAttributeNames: { '#count': 'count' },
          ExpressionAttributeValues: { ':one': 1 },
        }),
      );
    },
    list: async (day) => {
      const rows: Array<{ key: string; count: number }> = [];
      let start: Record<string, unknown> | undefined;
      do {
        const page = await client.send(
          new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: '#day = :day',
            ExpressionAttributeNames: { '#day': 'day' },
            ExpressionAttributeValues: { ':day': day },
            ExclusiveStartKey: start,
          }),
        );
        (page.Items ?? []).forEach((item) => rows.push({ key: String(item.key), count: Number(item.count) }));
        start = page.LastEvaluatedKey;
      } while (start);
      return rows;
    },
  };
}
