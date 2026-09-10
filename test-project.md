# CI/CD Pipeline Implementation & Troubleshooting Post-Mortem

**To:** Manager
**From:** Srinidhi Kasture, DevOps and Linux System Engineer
**Project:** Insta-Like System Integration via Tekton and Harbor
**Environment:** Minikube (Local Kubernetes), Tekton CI, Local Harbor Registry

---

## 1. Project Overview

The objective was to implement a fully functional Continuous Integration (CI) pipeline using **Tekton** to build a Next.js application (Insta-Like System) via **Kaniko** and push the resulting Docker image to a local **Harbor** container registry hosted within a Minikube cluster.

Throughout the implementation, several networking, filesystem, and virtualization bottlenecks were encountered. This document serves as a detailed engineering post-mortem, outlining the errors faced, the root causes, and the strategic pivots made to achieve a successful, highly optimized build process.

---

## 2. Infrastructure Setup & Baseline

Before initiating the pipeline, the following baseline infrastructure was established:

* **Kubernetes Environment:** Minikube (single-node cluster).
* **CI/CD Engine:** Tekton Pipelines installed on Minikube.
* **Image Registry:** Harbor deployed locally and exposed insecurely via NodePort at `192.168.49.2:30002`.
* **Authentication:** A Kubernetes Secret (`harbor-creds`) was created to authenticate Kaniko against the Harbor registry.

---

## 3. The CI Pipeline Journey & Strategic Pivots

### Phase 1: Bypassing External Git Connectivity

* **Initial Strategy:** Use Tekton's `git-clone` task to pull the repository directly from GitHub into a Tekton workspace.
* **Error Encountered:** SSL certification errors originating from within the Minikube virtual machine when attempting to reach GitHub.
* **Strategic Pivot:** Instead of debugging Minikube's outbound SSL intercepts, the strategy shifted to mounting the local host directory directly into Minikube using `minikube mount $(pwd):/workspace`.
* **Volume Binding Fix:** Tekton's `PipelineRun` does not support raw `hostPath` bindings in workspaces. To bridge this, a `PersistentVolume` (PV) and `PersistentVolumeClaim` (PVC) were manually provisioned to map the 9p mount into the Tekton workspace.

### Phase 2: Resolving Pipeline Initialization & Secrets

* **Error Encountered:** The Tekton build pod hung indefinitely in the `Init:0/2` state.

  ```text
  Warning  FailedMount  MountVolume.SetUp failed for volume "docker-config" : secret "harbor-creds" not found
  ```

* **Root Cause:** The `harbor-creds` secret was missing from the `default` namespace where the PipelineRun was executing.
* **Resolution:** Recreated the Docker registry secret explicitly in the `default` namespace. The Kubelet immediately detected the secret, mounted the volume, and unblocked the init containers.

### Phase 3: Docker Hub Rate Limits & `502 Bad Gateway`

* **Error Encountered:** Kaniko failed to pull the `node:18-alpine` base image.

  ```text
  error building image: ... GET https://index.docker.io/v2/: unexpected status code 502 Bad Gateway
  ```

* **Root Cause:** The provided Harbor `.dockerconfigjson` was either being mistakenly sent to Docker Hub, or the cluster's outbound traffic was intercepting the request.
* **Strategic Pivot (Image Caching):** Completely bypassed Docker Hub by pulling the base images (`node:18-alpine` and later `node:22-alpine`) on the host machine, tagging them, and pushing them directly into the local Harbor registry. The `Dockerfile` was then updated to pull `FROM 192.168.49.2:30002/library/node:22-alpine`. Added `--insecure-pull` flags to Kaniko.

### Phase 4: The 9p Filesystem & NPM Networking Battles

This phase required multiple iterations to overcome Minikube's virtualization limitations.

#### Attempt A: In-Cluster `npm install`

* **Error:** `npm install` hung silently and eventually timed out. A curl test (`curl -I https://registry.npmjs.org`) returned:

  ```text
  curl: (60) SSL: no alternative certificate subject name matches target hostname
  ```

* **Root Cause:** Deep packet inspection, captive portal, or proxy intercepting outbound HTTPS traffic from the Minikube network bridge.

#### Attempt B: Host-Side `npm install` & 9p Mount Crash

* **Strategy:** Ran `npm install` natively on the host machine to bypass the pod's network intercept, intending to let Kaniko just `COPY node_modules`.
* **Error:**

  ```text
  resolving sources: readdirent /workspace/source/node_modules/lucide-react/dist/esm/icons: errno 526
  ```

* **Root Cause:** `errno 526` is a critical failure of the `9p` file-sharing protocol used by `minikube mount`. The mount crashed attempting to process the sheer volume of tiny files within `node_modules` (specifically, thousands of icon files). `.dockerignore` did not resolve this because Kaniko stat-checks the context before ignoring.

#### Attempt C: Strict-SSL Bypass

* **Strategy:** Deleted `node_modules` from the host to fix the 9p crash. Re-attempted in-cluster installation by injecting `npm config set strict-ssl false` into the Dockerfile to bypass the SSL certificate intercept.
* **Error:**

  ```text
  npm error network request to http://registry.npmjs.org/ajv failed, reason: socket hang up (ECONNRESET)
  ```

* **Root Cause:** Virtual network interface dropped the connections due to the high volume of concurrent HTTP requests generated by npm.

---

## 4. The Final Strategy: Pre-Compiled Artifact Injection

Recognizing that heavy computation and massive file-tree generation (`npm install` & `npm run build`) are highly unstable over Minikube's virtualized network and 9p mount, the fundamental CI strategy was changed to **Artifact Injection**.

Instead of treating Kaniko as a build server, it was repurposed purely as an image packager.

### The Winning Workflow

1. **Host Execution:** `npm install` and `npm run build` were executed natively on the host machine where networking and I/O are unconstrained.
2. **Streamlined Dockerfile:** The Dockerfile was reduced to a single lightweight stage. It copied only the required pre-built Next.js production artifacts (`.next/standalone` and `.next/static`) into the container.
3. **Fast Execution:** By removing dependency fetching and compiling from the pod, Kaniko successfully built and pushed the image to Harbor in **under 10 seconds**.

---

## 5. Final Working Configurations

### The Optimized Dockerfile

```dockerfile
FROM 192.168.49.2:30002/library/node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV production

# Directly copy pre-built artifacts from the host
COPY package.json next.config.ts ./
COPY public ./public
COPY .next/standalone ./
COPY .next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
```
