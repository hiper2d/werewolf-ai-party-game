from boto3.resources.base import ServiceResource

import boto3


def get_dynamo_client() -> ServiceResource:
    return boto3.client(
        "dynamodb",
        endpoint_url="http://localhost:8000"
    )


def get_dynamo_resource():
    return boto3.resource(
        "dynamodb",
        endpoint_url="http://localhost:8000"
    )