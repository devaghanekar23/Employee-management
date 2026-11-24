pipeline {
    agent any

    environment {
        DOCKER_IMAGE   = 'devaghanekar/employee-management'
        IMAGE_TAG      = "${BUILD_NUMBER}"
        DOCKER_CRED_ID = 'docker-hub-credentials'

        K8S_NAMESPACE  = 'employee-app'
        SERVICE_NAME   = 'employee-app-service'
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
                sh 'docker build -t ${DOCKER_IMAGE}:${IMAGE_TAG} .'
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
                    '''
                }
            }
        }

        stage('Prepare Base Resources') {
            steps {
                sh '''
                    kubectl apply -f k8s/namespace.yml
                    kubectl apply -f k8s/configmap.yml
                    kubectl apply -f k8s/secret.yml
                    kubectl apply -f k8s/pvc.yml
                    kubectl apply -f k8s/mysql.yml
                    kubectl rollout status deployment/mysql -n ${K8S_NAMESPACE} --timeout=240s

                    # Service sirf tab banao jab pehle se na ho (selector reset na ho)
                    kubectl get svc ${SERVICE_NAME} -n ${K8S_NAMESPACE} >/dev/null 2>&1 \
                      || kubectl apply -f k8s/service.yml
                '''
            }
        }

        stage('Detect Live Color') {
            steps {
                script {
                    def active = sh(
                        script: "kubectl get svc ${SERVICE_NAME} -n ${K8S_NAMESPACE} -o jsonpath='{.spec.selector.version}' 2>/dev/null || true",
                        returnStdout: true
                    ).trim()
                    env.ACTIVE_COLOR = active
                    env.NEW_COLOR    = (active == 'blue') ? 'green' : 'blue'
                    echo "LIVE: ${active ?: 'none'}  |  DEPLOYING TO: ${env.NEW_COLOR}"
                }
            }
        }

        stage('Deploy to Idle Color') {
            steps {
                sh '''
                    sed -e "s|__COLOR__|${NEW_COLOR}|g" \
                        -e "s|__IMAGE__|${DOCKER_IMAGE}:${IMAGE_TAG}|g" \
                        k8s/templates/deployment.tpl.yml | kubectl apply -f -

                    kubectl rollout status deployment/employee-app-${NEW_COLOR} \
                      -n ${K8S_NAMESPACE} --timeout=240s
                '''
            }
        }

        stage('Smoke Test (before switch)') {
            steps {
                sh '''
                    POD_IP=$(kubectl get pod -n ${K8S_NAMESPACE} \
                      -l app=employee-app,version=${NEW_COLOR} \
                      -o jsonpath='{.items[0].status.podIP}')
                    echo "Testing ${NEW_COLOR} pod at $POD_IP"

                    kubectl run smoke-${BUILD_NUMBER} --rm -i --restart=Never \
                      --image=busybox:1.36 -n ${K8S_NAMESPACE} -- \
                      wget -q -T 10 -O /dev/null http://$POD_IP:3000/login
                '''
            }
        }

        stage('Switch Traffic') {
            steps {
                sh '''
                    kubectl patch svc ${SERVICE_NAME} -n ${K8S_NAMESPACE} \
                      -p '{"spec":{"selector":{"app":"employee-app","version":"'"${NEW_COLOR}"'"}}}'

                    echo "Traffic switched to ${NEW_COLOR}"
                    kubectl get endpoints ${SERVICE_NAME} -n ${K8S_NAMESPACE}

                    # Purani rolling wali deployment hatao (sirf pehli migration mein kaam aata hai)
                    kubectl delete deployment employee-app -n ${K8S_NAMESPACE} --ignore-not-found
                    kubectl delete hpa employee-app-hpa -n ${K8S_NAMESPACE} --ignore-not-found
                '''
            }
        }

        stage('Verify') {
            steps {
                sh '''
                    kubectl get deployments -n ${K8S_NAMESPACE}
                    kubectl get pods -o wide -n ${K8S_NAMESPACE}
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
                      -n ${K8S_NAMESPACE} svc/${SERVICE_NAME} 3001:80 \
                      > /tmp/employee-port-forward.log 2>&1 &

                    sleep 5
                    curl -s -o /dev/null -w "App HTTP status: %{http_code}\\n" http://localhost:3001/login || true
                '''
            }
        }
    }

    post {
        success {
            echo "Blue-Green done. Live color: ${env.NEW_COLOR}. Rollback color: ${env.ACTIVE_COLOR ?: 'none'}"
        }
        failure {
            echo "Pipeline failed. Live traffic abhi bhi ${env.ACTIVE_COLOR ?: 'purane'} version pe hai (switch nahi hua ya fail hua)."
        }
        always {
            sh '''
                docker image rm ${DOCKER_IMAGE}:${IMAGE_TAG} || true
                docker logout || true
            '''
        }
    }
}