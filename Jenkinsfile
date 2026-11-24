pipeline {
    agent any

    environment {
        DOCKER_IMAGE    = 'devaghanekar/employee-management'
        IMAGE_TAG       = "${BUILD_NUMBER}"
        DOCKER_CRED_ID  = 'docker-hub-credentials'

        K8S_NAMESPACE   = 'employee-app'
        DEPLOYMENT_NAME = 'employee-app'
        SERVICE_NAME    = 'employee-app-service'
    }

    stages {
        stage('Checkout Master Branch') {
            steps {
                git branch: 'master',
                    url: 'https://github.com/devaghanekar23/Employee-management.git'
            }
        }

        stage('Build Docker Image') {
            steps {
                sh '''
                    docker build -t ${DOCKER_IMAGE}:${IMAGE_TAG} -t ${DOCKER_IMAGE}:latest .
                '''
            }
        }

        stage('Push to Docker Hub') {
            steps {
                withCredentials([
                    usernamePassword(
                        credentialsId: "${DOCKER_CRED_ID}",
                        usernameVariable: 'DOCKER_USER',
                        passwordVariable: 'DOCKER_PASS'
                    )
                ]) {
                    sh '''
                        set +x
                        echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin
                        docker push ${DOCKER_IMAGE}:${IMAGE_TAG}
                        docker push ${DOCKER_IMAGE}:latest
                    '''
                }
            }
        }

        stage('Deploy to Kubernetes') {
            steps {
                sh '''
                    # deployment.yml mein local image ki jagah Docker Hub ki nayi image daalo
                    sed -i "s|image: employee-management-app:latest|image: ${DOCKER_IMAGE}:${IMAGE_TAG}|" k8s/deployment.yml

                    # Namespace sabse pehle
                    kubectl apply -f k8s/namespace.yml

                    # Baaki sab (configmap, secret, pvc, mysql, deployment, service, hpa)
                    kubectl apply -f k8s/

                    # Pehle MySQL ready hone do, phir app
                    kubectl rollout status deployment/mysql \
                      -n ${K8S_NAMESPACE} --timeout=240s

                    kubectl rollout status deployment/${DEPLOYMENT_NAME} \
                      -n ${K8S_NAMESPACE} --timeout=240s
                '''
            }
        }

        stage('Verify Deployment') {
            steps {
                sh '''
                    kubectl get deployments -n ${K8S_NAMESPACE}
                    kubectl get pods -o wide -n ${K8S_NAMESPACE}
                    kubectl get services -n ${K8S_NAMESPACE}
                    kubectl get pvc -n ${K8S_NAMESPACE}
                    kubectl get hpa -n ${K8S_NAMESPACE} || true
                '''
            }
        }

        stage('Port Forward (Expose App)') {
            steps {
                sh '''
                    pkill -f "[k]ubectl port-forward.*${SERVICE_NAME}" || true
                    sleep 2

                    JENKINS_NODE_COOKIE=dontKillMe \
                    nohup kubectl port-forward --address 0.0.0.0 \
                      -n ${K8S_NAMESPACE} \
                      svc/${SERVICE_NAME} 3001:80 \
                      > /tmp/employee-port-forward.log 2>&1 &

                    sleep 5
                    curl -s -o /dev/null -w "App HTTP status: %{http_code}\\n" http://localhost:3001/login || true
                '''
            }
        }
    }

    post {
        success {
            echo 'Employee Management app deployed successfully! Open: http://<EC2-IP>:3001'
        }

        failure {
            echo 'Pipeline failed. Check Console Output.'
        }

        always {
            sh '''
                docker image rm ${DOCKER_IMAGE}:${IMAGE_TAG} || true
                docker image rm ${DOCKER_IMAGE}:latest || true
                docker logout || true
            '''
        }
    }
}
