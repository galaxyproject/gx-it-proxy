#!/bin/bash

: ${NAMESPACE:=proxytest}
kubectl --namespace=$NAMESPACE delete pod,svc --all 
kubectl delete namespaces $NAMESPACE
