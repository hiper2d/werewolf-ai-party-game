import boto3
from boto3.dynamodb.conditions import Key

# Configure DynamoDB connection to local instance
dynamodb = boto3.resource('dynamodb', endpoint_url="http://localhost:8000")

# Function to create a table if it doesn't exist
def create_table():
    try:
        table = dynamodb.create_table(
            TableName='MySampleTable',
            KeySchema=[
                {
                    'AttributeName': 'id',
                    'KeyType': 'HASH'  # Partition key
                },
            ],
            AttributeDefinitions=[
                {
                    'AttributeName': 'id',
                    'AttributeType': 'S'
                },
            ],
            ProvisionedThroughput={
                'ReadCapacityUnits': 10,
                'WriteCapacityUnits': 10
            }
        )

        # Wait for the table to be created
        table.meta.client.get_waiter('table_exists').wait(TableName='MySampleTable')
        print("Table created successfully.")
    except Exception as e:
        print(e)

# Function to add a record to the table
def add_record(table_name, record):
    table = dynamodb.Table(table_name)
    response = table.put_item(Item=record)
    return response

# Function to read a record from the table
def read_record(table_name, record_id):
    table = dynamodb.Table(table_name)
    response = table.query(
        KeyConditionExpression=Key('id').eq(record_id)
    )
    return response['Items']

# Example usage
create_table()  # Create the table if it doesn't exist

record = {
    'id': '1',
    'name': 'John Doe',
    'age': 30,
}

# Add a record
add_record('MySampleTable', record)

# Read the record back
print(read_record('MySampleTable', '1'))
