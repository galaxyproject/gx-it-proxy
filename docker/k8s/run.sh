#!/bin/bash

# Namespace to run test in.
: ${NAMESPACE:=proxytest}

# Create namespace for objects.
kubectl create -f namespace.json

# Create simulated IT job with an exposed port.

# First try was with pod, but re-did as proper job...
#kubectl create -f running-container-deployment.yaml --namespace=$NAMESPACE
kubectl create -f it-job.yaml --namespace=$NAMESPACE

# Create deployment for gx-it-proxy.
kubectl create -f proxy-deployment.yaml --namespace $NAMESPACE

# Export gx-it-proxy port.
kubectl expose deployment proxy --type=NodePort --namespace $NAMESPACE

# Debug info.
kubectl get services --namespace $NAMESPACE
kubectl describe service proxy --namespace $NAMESPACE

echo "Sleeping to let proxy run."
sleep 5

echo "Setting up port forwarding for proxy."
kubectl port-forward deployment/proxy 8910:8910 --namespace $NAMESPACE &

CONTAINER_IP=`kubectl get pods --namespace proxytest -o=jsonpath='{.items[0].status.podIP}' -l 'app.kubernetes.io/name=running-it-container'`

sleep 5

curl -H "x-interactive-tool-host: $CONTAINER_IP" -H 'x-interactive-tool-port: 80' localhost:8910
