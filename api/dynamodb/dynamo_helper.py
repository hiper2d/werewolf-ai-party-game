import os

import boto3


def get_dynamo_resource():
    return boto3.client(
        "dynamodb",
        endpoint_url="http://localhost:8000"
    )