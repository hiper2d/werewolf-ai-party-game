import os

import boto3


def get_dynamo_resource() -> boto3.session.Session.client:
    return boto3.client(
        "dynamodb",
        endpoint_url="http://localhost:8000"
    )