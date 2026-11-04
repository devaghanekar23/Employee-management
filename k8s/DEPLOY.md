# Minikube Deployment Steps

```bash
# 1. Minikube start + metrics-server (HPA ke liye zaroori)
minikube start --driver=docker
minikube addons enable metrics-server

# 2. Minikube ke docker me image build karo
eval $(minikube docker-env)
docker build -t employee-manager:v1 .

# 3. Apply (order important)
kubectl apply -f k8s/namespace.yml
kubectl apply -f k8s/configmap.yml
kubectl apply -f k8s/secret.yml
kubectl apply -f k8s/pvc.yml
kubectl apply -f k8s/mysql.yml
kubectl apply -f k8s/deployment.yml
kubectl apply -f k8s/service.yml
kubectl apply -f k8s/hpa.yml

# 4. Check
kubectl get all -n employee-app
kubectl get hpa -n employee-app
kubectl logs deploy/employee-app -n employee-app

# 5. Open app
minikube service employee-app-service -n employee-app --url
# EC2 par ho to: kubectl port-forward --address 0.0.0.0 svc/employee-app-service 8080:80 -n employee-app
```
