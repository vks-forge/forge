---
title: The Real Cost of Always-On AI Agents on Kubernetes (and How to Kill Idle GPU
  Burn) - ScaleOps
id: the-real-cost-of-always-on-ai-agents-on-kubernetes-and-how-to-kill-idle-gpu-burn
tags:
- ai-software-factory-architecture-58e4cc
- cost-optimization
- idle-gpu-burn
- kubernetes
created: '2026-10-12T09:00:13.107618Z'
updated: '2026-10-12T09:01:35.208136Z'
source: https://scaleops.com/blog/the-real-cost-of-always-on-ai-agents-on-kubernetes-and-how-to-kill-idle-gpu-burn/
source_domain: scaleops.com
fetched_at: '2026-10-12T09:00:13.106669Z'
fetch_provider: builtin
status: draft
type: note
tier: unknown
content_type: unknown
deprecated: false
summary: 'ScaleOps measured a live GKE fleet of 3x NVIDIA T4 GPUs (1 per n1-standard-8
  node, ~$0.73/node-hr) running synthetic single-tenant agent workloads. Fixed reserved
  cost: $1,576/month (~$525/node), validated against GCP on-demand pricing. Measured
  GPU duty cycle was 23.5% over 24 hours (avg utilization 21.8%, bursting to 100%),
  meaning ~$1,200/month (77%) of the GPU bill was idle burn on a single-tenant deployment.
  Key mechanism findings: CPU-based Horizontal Pod Autoscaler is blind to GPU-bound
  bursts (GPU hit 100% while CPU peaked at 25%, never crossing the 50% HPA threshold)
  so it collapsed the fleet to 1 replica while work queued 7-10 items deep. KEDA with
  queue-depth triggers and a warm floor (minReplicaCount=1) only achieved a ~28% reduction
  under continuous ~6-minute bursts (HPA''s 5-min scale-down stabilization window
  kept resetting), averaging 2.17 GPUs/hour versus fixed 3; true idle gaps dropped
  it to 1 warm or 0 scaled-to-zero. Cold start after scale-to-zero measured at ~3.2
  minutes (49s node provisioning + 143s scheduling/image-pull/weight-load into VRAM).
  GPU memory rightsizing cut per-replica requests from 15GiB to 3.06GiB, letting ~5
  workloads co-reside on one 16GB T4 instead of 1, reclaiming ~$300/month on that
  single workload. Container CPU/memory rightsizing cut requests ~72% (4 cores to
  1117m) and ~99% (24GiB to 282MiB) with zero restarts via in-place pod resize. Caveat:
  duty cycle and idle-share figures are specific to single-tenant (model-in-container)
  deployments; a shared inference tier serving many agents via continuous batching
  runs a materially higher duty cycle, so idle share must be measured per GPU deployment
  and summed across the fleet, not assumed uniform.'
utility_score: 15.0
---

The Real Cost of Always-On AI Agents on Kubernetes (and How to Kill Idle GPU Burn) - ScaleOps
Skip to content
Book a Demo
Get Started
Sign In
All articles
The Real Cost of Always-On AI Agents on Kubernetes (and How to Kill Idle GPU Burn)
Nic Vermandé
Aug 21, 2026
Featured
Table of contents
Achieve Full GPU Utilization
Cut GPU costs by 70%
Maximize model performance
Free your engineers
Book a Demo
Running
AI agents on Kubernetes
means hosting long-lived, stateful agent processes as workloads on a cluster. In most production deployments the agent process and the GPU are in different pods. The agent itself is orchestration logic, tool definitions, and session state, usually built with a framework like LangChain or LlamaIndex, and it is CPU-only. The GPU sits in a separate inference tier, a runtime such as vLLM or NVIDIA Triton, serving many agents at once behind an HTTP endpoint. A smaller set of deployments loads the model inside the agent’s own container, so a single process holds both the orchestration logic and the model weights with no serving layer in between. That arrangement changes which of the fixes below apply, and the difference is flagged at each point where it matters.
The hidden cost is the same in both arrangements. GPU capacity is reserved for the lifetime of the pod holding it, agent demand arrives in bursts, and Kubernetes has no native signal that tells it the accelerator is sitting idle between tasks. In a split deployment that idle capacity is spread across every inference deployment serving the fleet, which in a multi-model stack means a main model, a routing or classification model, an embedding model, and a re-ranker, each reserving its own accelerator and each with its own duty cycle.
Most teams run inference capacity always-on by default when the workload shape argues for inference-aware replica scaling, and the resulting idle-GPU bill is the largest and most invisible line item in an agent platform. We are not going to argue it from first principles. We built the fleet, measured it, and broke it on purpose.
What we measured.
Every number below comes from a live run on a GKE cluster of three NVIDIA T4 GPUs (one per n1-standard-8 node) running a synthetic agent (a resident model footprint with queue-driven GPU bursts) instrumented with the NVIDIA DCGM per-pod exporter and managed with ScaleOps. We measured the idle fleet, then turned ScaleOps automation on and captured what it reclaimed. The synthetic workload holds its model in the same container as the agent logic, with no inference server in front of it, so the figures describe a single-tenant deployment where the weights are the entire GPU memory footprint. Where a result depends on that arrangement, we say so at the point of use. Full methodology is at the end.
Scope and prerequisites
This is written for platform, infrastructure, FinOps, and SRE engineers who already run Kubernetes and are putting agentic workloads on it. It assumes you are comfortable with the scheduler, horizontal pod autoscaling, KEDA, QoS classes, and GPU requests.
In scope:
the cost, scaling, and state behavior of GPU inference capacity serving agent fleets, the agent workloads themselves, and the Kubernetes mechanisms that fix them.
Out of scope:
how to build the agents, prompt design, and model selection.
Topology:
the split deployment is treated as the default and the single-container arrangement as the narrower case, because which one you run changes which of the five fixes below applies.
Key takeaways: AI agents on Kubernetes
Three T4 GPUs reserved 24/7 cost ~$1,576/month; the workloads were busy 23.5% of the time, so roughly 77% of that, about $1,200/month, was idle GPU on a single-tenant deployment. A shared inference tier fronting many agents aggregates their bursts and runs a higher duty cycle, so read the idle share per deployment and sum it across the fleet rather than assuming 77% everywhere.
Horizontal pod autoscaling keys off CPU and memory. We measured a CPU-driven Horizontal Pod Autoscaler collapse the fleet to one replica while the GPU was pegged at 100%, and it was blind to the work.
There are two different wastes: rightsizing shrinks over-provisioned requests, but only replica scaling and scale-to-zero reclaim idle GPUs, and idle is the far bigger bill.
Reactive scaling is too slow for bursts. They hit every ~6 minutes, barely longer than the HPA’s 5-minute scale-down window. So the fleet rarely scales down before the next one, and reactive scaling with a warm floor (one replica always kept ready) cut only ~28%. The real savings come from genuine idle windows and predictive models.
Scaling to zero costs ~3.2 minutes of cold start on the next request, and has a trap: the scaling signal is published by the agents, so at zero replicas there is nothing left to publish it. Splitting the tiers removes the trap, because the agent pods stay up and keep publishing while the inference tier goes to zero.
The whole-GPU assumption is the root of idle burn: a deployment holds a full accelerator it uses only in bursts. Time-slicing, MPS, MIG, and Dynamic Resource Allocation let several share one.
ScaleOps works alongside the Cluster Autoscaler, Karpenter, the default scheduler, horizontal pod autoscaling, and KEDA; it gives those tools better inputs rather than replacing them.
The money: what idle AI agents on Kubernetes actually cost
Start with the bill, because the bill is the argument.
Our fleet was three GPU workloads, one NVIDIA T4 each, on
`n1-standard-8`
nodes in GKE. ScaleOps put the GPU cost at
$1,576/month
, about
$525 per node
— which matches
GCP’s on-demand price
for that instance (~$0.73/node-hour), so the cost basis is validated rather than asserted.
Then we measured how much of that capacity actually did work. Over 24 hours,
GPU duty cycle was 23.5%
(the fraction of time DCGM reported per-pod GPU utilization above 10%), average utilization was 21.8%, and during a burst the GPU
saturated at 100%
. In other words, each agent fully uses its accelerator while a task runs, and then leaves it idle roughly
77% of the time
.
Apply that to the bill and the headline writes itself:
about $1,200 of the $1,576 monthly GPU spend was idle.
Three GPUs reserved around the clock to do less than a quarter of a GPU’s worth of work.
That 23.5% is the duty cycle of a single-tenant deployment, one workload per card, and it is worth being precise about how it generalizes. A shared inference tier serving forty agents whose bursts are uncorrelated will run a materially higher duty cycle, because multiplexing many requests onto one accelerator through continuous batching is what fills those gaps. The fleet-level cost does not come from one deployment being idle three quarters of the time. It comes from the number of separate GPU deployments in the stack and the duty cycle of each: a main model at healthy utilization, a routing model at single digits, an embedding model at single digits, a re-ranker at single digits, replicated across development, staging, and production. Measured per deployment and summed, the idle line is usually larger than anyone expected, and it is assembled out of individually unremarkable numbers.
The pattern is not specific to T4s or to this fleet. Whenever duty cycle is low, the idle line dominates, and nothing in a default cluster is trying to reclaim it.
Why Kubernetes can’t see it
Kubernetes is a capable substrate for agentic workloads. It provides declarative resource management, namespace isolation for multi-tenant agents, and an ecosystem of custom resources and runtimes such as kagent and the Kubernetes Agent Sandbox project that make agents first-class objects. What it does not give you, out of the box, is any awareness that reserved accelerator capacity is going unused. There are four gaps.
Horizontal pod autoscaling reacts to the wrong signals.
The HPA scales replica count on CPU and memory (or custom metrics you wire in yourself). A GPU workload spends its time in CUDA kernels rather than in the process scheduler, so CPU tracks its real load poorly. It never crosses a scale-down threshold when idle, and it never triggers a scale-up for a burst that does not show up as CPU.
We tested this. We put a CPU-based Horizontal Pod Autoscaler (target 50%, min 1 / max 8) on the fleet under bursty load. During bursts the GPU hit 100% while CPU peaked at 25%, never crossing the 50% target. The controller scaled the resident workloads down to a single replica because CPU looked idle, and it stayed blind to the bursts because they never showed up as CPU, so the task queue backed up to 7 to 10 items, under-served. CPU is simply not the signal for GPU-bound inference work.
There is no native signal for inference work.
What actually indicates a GPU workload is busy is request queue depth, tokens per second, batch occupancy, or GPU utilization, none of which Kubernetes scales on natively. You have to build that pipeline: export the metrics (commonly via OpenTelemetry and the DCGM exporter), feed them to an external scaler, and define the scaling behavior yourself.
The scheduler never reclaims idle accelerators.
Once a pod requests a GPU, that device is reserved for the pod’s lifetime. The scheduler does not preempt or reclaim an underused accelerator the way it might rebalance CPU. An idle GPU pod holds its accelerator until something external releases it, which, as we will see, means scaling the replica down, not waiting for the scheduler.
Agents are stateful, singleton workloads.
As the Kubernetes Agent Sandbox project frames it, an agent is typically an isolated, stateful, singleton workload, closer to a digital workspace than a stateless replica behind a load balancer. You cannot freely scale a singleton horizontally, and you cannot evict it casually, because eviction drops in-flight task state. In a split deployment that constraint belongs to the agent tier, which is CPU-only and cheap to leave running, while the inference tier behind it is comparatively stateless and is the part that can be scaled freely. Conflating the two is what produces the instinct to leave everything on, and it is also what makes aggressive bin-packing feel more dangerous than it is.
These map to the gaps practitioners keep naming for AI on Kubernetes — gang scheduling, heterogeneous-hardware awareness, scaling on AI-native signals, and durable state. Every one of them shows up below.
The naive always-on pattern, and where it breaks
Here is the manifest most teams ship first — a reasonable-looking always-on agent
`Deployment`
requesting a full GPU per replica. This is the single-container arrangement, with the agent loading the weights itself, and it is the one we measured. Every annotation marks a place it costs you.
```
xapiVersion: apps/v1
kind: Deployment
metadata:
  name: research-agent
  namespace: agents
spec:
  replicas: 3                       # fixed fleet size — never scales with actual demand
  selector:
    matchLabels:
      app: research-agent
  template:
    metadata:
      labels:
        app: research-agent
    spec:
      containers:
        - name: agent
          image: registry.internal/research-agent:1.7.2
          resources:
            requests:
              cpu: "4"
              memory: 24Gi
              nvidia.com/gpu: "1"   # whole GPU reserved for the pod's entire lifetime
            limits:
              cpu: "4"
              memory: 24Gi
              nvidia.com/gpu: "1"   # requests == limits => Guaranteed QoS, but the GPU sits idle between tasks
          volumeMounts:
            - name: scratch
              mountPath: /scratch    # in-flight task state on ephemeral storage (see failure mode 2)
      volumes:
        - name: scratch
          emptyDir: {}
```
Split the tiers, and the same waste appears in the inference deployment instead, with one addition that matters later. The agent Deployment loses its nvidia.com/gpu request and gains an endpoint, and the GPU moves here:
```
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vllm-llama3
  namespace: inference
spec:
  replicas: 3                       # fixed fleet size, never scales with actual demand
  template:
    spec:
      containers:
        - name: vllm
          image: vllm/vllm-openai:latest
          args:
            - --model=meta-llama/Llama-3-8B-Instruct
            - --gpu-memory-utilization=0.90   # pre-allocated KV cache, not waste (see Fix 3)
          resources:
            requests:
              nvidia.com/gpu: "1"   # whole GPU reserved for the pod's entire lifetime
            limits:
              nvidia.com/gpu: "1"
```
No HPA, no scale-to-zero, no rightsizing. Three GPUs reserved around the clock for a workload busy a quarter of the time. The CPU and memory requests (4 cores / 24 GiB) are defensive padding, and as the failure modes below show, that padding is exactly how fleets end up over-provisioned. We reproduced all three failure modes live.
Failure mode 1 — under-request and get OOMKilled mid-task.
Agents are spiky in memory: a long context or a large tool result can briefly multiply working-set size. We set a 2 GiB memory limit and drove a 3 GB working set; the container was
OOMKilled (exit 137)
and restarted mid-task. The defensive reaction — request for the peak (24 GiB) and eat the idle cost — is how the manifest above got its padding. This one belongs to the agent tier in either arrangement, and it is cheap to fix because no GPU is involved.
Failure mode 2 — evict the pod and lose in-flight state.
The agent writes working state to an
`emptyDir`
. We drained the node with an active task: the pod had
12 state files
, and the replacement came up
empty
— the in-flight task was lost, because
`emptyDir`
does not survive the pod. Statefulness is why teams avoid eviction entirely and pin agents to stable, underused nodes. Fix 5 covers the patterns that make this survivable.
Failure mode 3 — scale to zero and pay in cold starts.
The obvious cost fix is to scale idle GPU workload to zero. But a GPU cold start is not free: we measured
~3.2 minutes
for the first request after idle —
49 seconds
to provision a node plus
143 seconds
for pod scheduling, image pull, and loading weights into VRAM. Scale to zero naively and you trade an idle-cost problem for a latency problem.
Each failure mode pushes teams toward the same defensive default: leave everything on. The rest of this piece is the set of mechanisms that make scaling down safe enough to actually do. In a split deployment the shape of the answer is that the agent tier stays warm because it is cheap and holds the state, and the inference tier is what gets scaled.
Fix 1 — Scale replicas on what agents actually do
Replace CPU-driven horizontal pod autoscaling with replica scaling keyed to queue depth, request rate, or GPU utilization.
KEDA
is the standard way to do this — it watches an external trigger, drives the underlying HPA for you, and can scale to zero, which plain horizontal pod autoscaling cannot. This is the exact
`ScaledObject`
we ran:
```
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: research-agent
  namespace: agents
spec:
  scaleTargetRef:
    name: research-agent          # the Deployment above
  minReplicaCount: 1              # warm floor: keep one agent ready (see cold-start section)
  maxReplicaCount: 8
  triggers:
    - type: prometheus           # queue depth is the real "busy" signal, not CPU
      metadata:
        serverAddress: http://prometheus.monitoring:9090
        metricName: agent_task_queue_depth
        query: sum(agent_task_queue_depth{app="research-agent"})
        threshold: "5"           # ~5 queued tasks per replica before adding one
  advanced:
    horizontalPodAutoscalerConfig:
      behavior:
        scaleDown:
          stabilizationWindowSeconds: 120   # default is 300; see the latency section for why this matters
```
In a split deployment, the same object points at the inference Deployment instead, and the queue-depth metric keeps coming from the agent tier, which is the arrangement that makes scale-to-zero workable.
Measured behavior: under a burst (queue ~40) the fleet wanted to scale to 8 but was capped at 3 by the node pool; on sustained idle (queue 0) it dropped to the warm floor of
1
, freeing two of three GPUs within about a minute of the scale-down stabilization window clearing, after which the Cluster Autoscaler reclaimed the now-empty GPU nodes. That is a
~67% idle-time GPU reduction
while keeping one replica warm. The fleet now tracks work instead of the clock, which is necessary, though as the next section shows it is not sufficient on its own.
This is where a platform layer does the wiring.
AI Replicas Optimization
scales inference replicas to real demand using GPU-native signals, KV cache size, waiting requests, and request volume, rather than generic CPU metrics, and scales eligible workloads to zero during low-demand periods while reducing cold-start impact when demand returns.
The scaling-loop latency problem
Reactive replica scaling, even on the right signal, runs through a control loop, and that loop has cumulative delay: a metric scrape (15 to 30s), KEDA’s polling interval (default 30s), the Horizontal Pod Autoscaler sync (default 15s) and its scale-down stabilization window (default 300s), then scheduling, possibly a new GPU node, and the cold start. Add it up and the loop reacts in minutes.
Agent bursts last seconds. Here is the consequence we measured directly: with
bursts every ~6 minutes
and the HPA’s
default 5-minute scale-down stabilization window
, the fleet barely scaled down during normal operation, because every new burst reset the high-water mark before the window could expire. Under that continuous churn, warm-mode scaling (
`minReplicaCount: 1`
) averaged
2.17 GPUs over an hour
, only about a
28% reduction
versus the fixed three, even though average GPU utilization rose from 22% to 38% from the denser packing. The big drop to one replica only happened during a genuine idle gap.
Reaction alone cannot serve bursty agents efficiently. Two things close the gap. Lowering the stabilization window (the
`stabilizationWindowSeconds: 120`
above) lets real idle gaps trigger scale-down sooner, though tightening it too far trades idle savings for thrashing, where every cycle pays a cold start. The structural fix is predictive models, anticipating the burst from observed patterns and pre-warming capacity before it arrives, so you are not fighting a stabilization window at all. Predictive models are the lever reactive horizontal pod autoscaling and KEDA simply do not have.
Fix 2 — Shorten the cold start
If reaction and scale-to-zero both depend on cold starts being cheap, making them cheap is its own work item. Our measured cold start broke down as
49 seconds of node provisioning
plus
143 seconds of pod scheduling, image pull, and loading weights into VRAM
. Each stage is independently addressable:
Pre-pull images
with a
`DaemonSet`
that holds the image, or bake them into the node image, so the multi-gigabyte pull is already done when a pod lands.
Cache model weights
on a
`PersistentVolume`
or node-local cache so the pod reads from fast storage instead of re-downloading.
Keep a warm node pool
— a little standing GPU capacity, or low-priority placeholder pods a real workload can preempt — so node provisioning is amortized.
Keep a warm replica floor
(
`minReplicaCount`
≥ 1) so the first request after a quiet period never pays the full chain. In our run this was the difference between
instant
(warm) and
~3.2 minutes
(cold).
The warm-pool and warm-floor sizes are the dial between idle cost and tail latency; set them from your latency SLO, not by default. (We go deeper on the GPU cold-start chain and warm-pool sizing in our dedicated [cold-starts deep dive](
https://scaleops.com/blog/reducing-gpu-cold-start-times-in-kubernetes-patterns-and-solutions/#:~:text=GPU cold starts in Kubernetes result from sequential operations with,t disappear with better configuration.).)
ScaleOps addresses two stages of this chain.
Capacity pre-provisioning
detects pending GPU workloads and creates lightweight capacity pods that trigger node provisioning ahead of the workload, so a node is spinning up before the inference pod enters the scheduling queue.
Constraint-aware placement
then makes that capacity usable: the capacity pods inherit the workload’s own node selectors, tolerations, and affinity rules, so capacity provisions where the workload will actually schedule rather than where generic GPU nodes happen to exist.
Fix 3 — Stop giving every workload a whole GPU
Replica scaling reduces
how many
GPU pods run. It does nothing about the deeper waste: a deployment that reserves a whole accelerator it only partly uses. The lever is GPU memory, and whether you can pull it depends on what is holding the card. Compute and memory move independently, and understanding why is the whole game.
On a tuned vLLM or Triton server, the VRAM reservation is a configured ceiling rather than a measured requirement.
An inference server pre-allocates GPU memory on startup up to its configured fraction, the
`--gpu-memory-utilization=0.90`
in the manifest above, and serving frameworks such as vLLM and TensorFlow Serving claim most of the available GPU memory by default regardless of what the workload consumes. Model weights are the constant part of that footprint. The KV cache is the dynamic part, growing with each concurrent request and reaching two to three times the weight footprint during a spike.
Two consequences follow, and they pull in opposite directions. Cutting the reservation below real KV cache occupancy costs maximum batch size and concurrency, which lowers throughput and raises latency while the card still reports as busy. But the default reservation is rarely the same number as real occupancy, and the gap between them is capacity nothing else can use, because fractional policies read the allocation rather than the consumption and cannot bin-pack around it. So the lever here is measurement rather than a fixed rule: profile actual memory consumption across load conditions and concurrency levels, then set the reservation from that instead of from the framework default. Sizing from a low-concurrency sample is the failure to avoid, because the cache has not finished growing.
ScaleOps
GPU Memory Optimization
runs this continuously in production, tracking how consumption shifts across load and concurrency and correcting over-provisioned reservations so memory-bound workloads become eligible for sharing. A model server running as a sidecar in the agent’s own pod behaves identically, because sharing a pod does not change how the serving layer allocates memory.
On a pod where the agent loads the weights itself, with no serving layer to pre-allocate a cache, the lever is real, and that is what we measured. ScaleOps rightsized the per-replica GPU memory request from 15 GiB to 3.06 GiB while each workload kept full burst access to the GPU’s compute. At ~15 GiB a single workload fills a 16 GB T4 and nothing else fits; rightsized to ~3 GiB, about five co-reside on one accelerator instead of one. The figure holds where the agent loads the weights itself and for small standalone models. It is not advice for a tuned serving tier.
The clearest case for sharing is the small-model sprawl.
A routing or classification model, an embedding model, and a re-ranker each cannot fill a card on their own, each currently reserves one, and each is idle most of the time. That is the multi-model cost from the opening section, and packing them onto a single accelerator addresses it directly.
Compute is shared in time.
A latency-sensitive workload saturates the GPU during a burst, so you cannot shrink its compute without breaking the SLO — and you do not need to. Multiple workloads coexist on one card by taking turns: each bursts to the full GPU when a task fires, and at a 23.5% duty cycle with second-long bursts, simultaneous bursts that actually collide are rare. The limiter is concurrent bursts, not steady state, so compute oversubscribes cleanly for this workload.
Memory is shared in space.
Model weights stay resident in VRAM for the entire life of the pod, and memory is not time-multiplexed, so every co-resident footprint has to fit the card’s physical memory
at the same time
. That is why memory rather than compute sets the packing density, while the compute keeps bursting at full speed underneath.
How ScaleOps shares the GPU.
It reserves the physical accelerator with a lightweight placeholder, then schedules multiple workload pods, each carrying an advisory fractional share. The fractions are not enforced in hardware — there is no per-pod compute cap — so a workload still bursts to the whole GPU when it needs to, and the pods take turns through the driver. This is
soft
sharing: no hard isolation, which is exactly right for bursty, trusted workloads that sit idle most of the time. ScaleOps does the reservation, the packing, and the memory rightsizing automatically, with no manifest surgery, hand-built profiles, or maintenance window. It reclaims about
$300/month
on this single workload — the action the dashboard labels “Automate fractional GPUs.” That figure counts only capacity that actually frees allocatable resources; workloads it cannot evict or restart are left out of it.
Soft sharing is one end of a spectrum, and it helps to know where it stops. GPU sharing runs from time-slicing and MPS (software, soft isolation, highest utilization for bursty work) through MIG (hardware-isolated slices on Ampere-generation GPUs and newer, up to seven instances depending on the model, with fixed profiles) to Dynamic Resource Allocation, the Kubernetes-native and scheduler-aware approach, which graduated to GA in Kubernetes 1.34 and is enabled by default from that release onward. ScaleOps automates the high-utilization end; for untrusted or multi-tenant workloads that need hard isolation, MIG slices or separate node pools remain the right tool.
Sharing mode
Isolation
Utilization gain
Hardware requirement
Time-slicing / MPS
None to soft
Highest for bursty workloads
Any NVIDIA GPU
MIG
Hard (dedicated mem + compute)
Bounded by fixed profiles
Ampere generation (CC 8.0+) and newer
DRA
Depends on driver / policy
Fine-grained, scheduler-aware
Ampere generation (CC 8.0+) and newer
ScaleOps fractional
Soft (advisory), automated
High — packed and rightsized for you
Any NVIDIA GPU
Sharing creates its own blind spot: once several workloads sit on one GPU, native metrics report only device-level utilization, so an HPA can no longer tell what each workload is actually using. ScaleOps reads workload-level GPU compute and memory utilization, and with inference-server observability enabled, additional serving-layer signals that distinguish what a framework has reserved from what it is actually using. It acts on those signals directly, adjusting the serving framework’s own memory allocation so the reservation tracks real consumption, rather than publishing metrics for another controller to consume.
See your agent fleet’s idle GPU spend. If you run agents on Kubernetes, the gap between reserved and used GPU-hours across your inference deployments is probably your biggest unmeasured cost.
Book a demo
and we’ll show the idle-versus-active breakdown on your own cluster.
Fix 4 — Rightsize the survivors without restarting
The compute lever is already spent. As Fix 3 showed, a latency-sensitive workload has to keep full GPU compute during its bursts, so that is preserved, and the GPU savings come from running
fewer replicas when idle
(Fix 1) plus packing the rightsized memory footprint (Fix 3). The lever left for this fix is the container CPU and memory requests, which were padded defensively. In a split deployment these sit on the agent pod, which is CPU-only, making this the safest change in the stack and the first one worth taking.
That padding is large, and Automated Pod Rightsizing reclaims it automatically. With the production policy on, it rightsized the container in place and the fleet converged within minutes, with zero restarts and no maintenance window:
Resource (per replica)
Before
After (applied)
Cut
CPU Request
4
1117m
~72%
Memory Request
24 GiB
~282 MiB
~99%
Kubernetes
in-place pod resize
is what makes this safe to run continuously: requests are adjusted without recreating the pod, so there is no restart to drop agent state. The 4-core, 24 GiB agent was rightsized to actual usage automatically, without a maintenance window.
Fix 5 — Make agent state eviction-safe and resumable
Everything above — scaling down, sharing a GPU, rebalancing nodes — is only safe if the disruption does not lose work. State is the precondition for the savings, not an afterthought, and failure mode 2 (12 state files, gone on eviction) is what happens when you ignore it. Agent state comes in three kinds:
Model weights
are large but reproducible; the cost of losing them is a cold start (Fix 2), and in a split deployment they live in the inference pod rather than the agent.
Conversation and session state
is small and should be externalized to a store — Redis for ephemeral session data, or Postgres with pgvector for durable agent memory — so any replica can serve any session and no single pod is irreplaceable.
In-flight task state
is the dangerous one: a long, multi-step task mid-execution when the pod is disrupted. This is what makes teams afraid to scale down at all.
The patterns that make in-flight work survivable are checkpointing and graceful drain — checkpoint long tasks so they resume from the last step, and give the pod time to flush that checkpoint on the way out:
```
lifecycle:
  preStop:
    exec:
      command: ["/bin/sh", "-c", "agentctl checkpoint --flush /state"]
terminationGracePeriodSeconds: 120     # give in-flight tasks time to checkpoint before SIGKILL
```
Pair that with a
PodDisruptionBudget so voluntary disruptions (node drains, consolidation) never take down more of the fleet than you can afford to interrupt at once:
```
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: research-agent
  namespace: agents
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: research-agent
```
Once state survives disruption, scale-down and GPU sharing stop being risky. The resulting posture is to keep the agent pods warm, because they are cheap and hold the state, and to scale the inference tier hard, because it is expensive and holds almost none.
What to measure before automating
Every fix so far leaned on a number the default cluster does not hand you. The Horizontal Pod Autoscaler scaled on CPU because CPU was what it had, and a GPU workload waiting on a queue barely touches it. Reactive scaling had nothing to warn it a burst was coming. Once several workloads share a card, the device metrics stop telling you which one is doing the work. And the padded requests stayed padded because nothing was watching what the container actually used. So underneath the scaling, the packing, and the rightsizing, this was a measurement problem the whole time. There are two sets of numbers to collect, and you need both.
The GPU side comes from NVIDIA’s DCGM exporter, running as a DaemonSet on the GPU nodes and scraped by Prometheus. The one that drives everything is
`DCGM_FI_DEV_GPU_UTIL`
, the percentage of time the compute engines were busy, and the exporter labels it with pod and namespace so you can pin utilization to a specific workload. Memory used comes off the same exporter. A minimal
`ServiceMonitor`
wires it in:
```
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: dcgm-exporter
  namespace: monitoring
spec:
  selector:
    matchLabels:
      app: dcgm-exporter
  endpoints:
    - port: metrics
      interval: 15s
```
One distinction worth keeping straight: utilization is the SM-busy percentage, not memory, and neither one is the same as useful work. A badly batched model can sit at 90% utilization and still waste the card, so you read utilization and memory together. The 23.5% duty cycle our fleet ran at is
`DCGM_FI_DEV_GPU_UTIL`
per pod, counted above 10%, over a day.
The agent side is the half the infrastructure cannot see, because it lives above the process. You instrument it in the agent itself and export it through OpenTelemetry into the same Prometheus. The signals that earn their place are request queue depth (the backlog of work waiting, which is the scale-up trigger CPU could never be), tokens per second (what the agent is actually producing, and what the cost tracks), tool-call concurrency (how many external calls are in flight, the real shape of a burst), and error rate (which climbs when you have packed too tightly or scaled down too far). Stamp them with the same pod, workload, and namespace labels DCGM uses, and both halves land in one place you can query together. In a split deployment these pods stay up regardless of inference replica count, which makes them the reliable publisher for a scale-from-zero trigger. With that in place, each number maps to a decision:
Signal
Drives
Queue depth, request rate
Replica scaling, and scale-to-zero (Fix 1)
Demand over time
Predictive models and pre-warming (Fix 2)
GPU utilization and memory
Rightsizing, and whether to fractionalize (Fix 3)
Container CPU and memory usage
Agent-tier rightsizing (Fix 4)
GPU-hours by label
Cost, per deployment and per agent
Error rate, latency
The SLO guardrail on the rest
The cost row is the one you do not get for free, and it is the reason the rest matters. The bill is reserved GPU-hours times your node’s GPU rate. On a single-tenant card that is easy. The moment workloads share a GPU, the device-level number cannot tell you who spent what, and a CPU-based view never saw the GPU at all. In a split deployment there is a second attribution step underneath that, because one shared inference deployment serves many agents, so splitting its cost per agent means correlating GPU-hours against per-agent request volume coming from the agent tier. Per-pod GPU utilization is what makes attribution possible on a shared card, and once both halves carry the same agent label, the spend splits by agent, by workflow, by team. Without it the GPU bill is one big number. With it you can point at the agent and the workflow driving it.
Where ScaleOps fits
Everything above is the work; ScaleOps is one way to operationalize it. AI Replicas Optimization scales inference replicas on GPU-native signals with predictive models, Automated Fractional GPUs packs workloads onto shared accelerators, GPU Memory Optimization corrects over-provisioned memory reservations, and Real-Time Pod Rightsizing adjusts container CPU and memory in place, all alongside the Cluster Autoscaler, Karpenter, the scheduler, horizontal pod autoscaling, and KEDA you already run rather than replacing any of them. The specifics, and the measured numbers, are in Fixes 1 through 4 above.
What the automation reclaimed
Across the five fixes the numbers landed in different places, so here is the whole picture in one view. Start with the operational side, because it is what makes the savings safe to take at all: every change above ran without a restart or a maintenance window. Automated Pod Rightsizing adjusted requests in place, replica scaling and fractional packing changed how the fleet used its GPUs while tasks kept running, and no agent lost work to get there. The cost recovery is a byproduct of that, not a tradeoff against it.
On the measured fleet, before and after ScaleOps:
Lever
Before
After
Running GPUs when idle
3, fixed 24/7
1 warm, or 0 with scale-to-zero
Workloads per T4
1
~5
GPU memory request (per replica)
15 GiB
3.06 GiB
Container CPU request
4 cores
1117m (~72% cut)
Container memory request
24 GiB
282 MiB (~99% cut)
Production considerations: what breaks at scale
The patterns work in isolation; production is where they interact. The failure modes that show up once a fleet is real:
GPU node fragmentation.
Whole-GPU and fractional pods scatter across nodes and strand partial capacity, which blocks consolidation. Smart Pod Placement and Node Optimization apply intelligent bin-packing to group them onto fewer nodes so the Cluster Autoscaler or Karpenter can reclaim the empty ones. MIG fragments capacity too, but a MIG slice is a fixed hardware partition the scheduler sees as its own device, so it schedules discretely and is not something ScaleOps repartitions.
Quotas.
A
`ResourceQuota`
on
`nvidia.com/gpu`
per namespace stops a team from bursting; size quotas with headroom for the warm pool and burst ceiling, or scaling silently stalls.
Multi-tenancy and isolation.
Time-slicing and MPS have no hard isolation, so a noisy or hostile neighbor degrades everyone on the device. Untrusted or cross-tenant workloads belong on MIG slices or separate node pools, behind namespace boundaries, RBAC, Secrets management,
`NetworkPolicy`
, and zero-trust controls on tool access.
The scale-from-zero trap.
The queue-depth metric that drives scale-up is published by the agents, so at zero replicas there is no publisher and KEDA cannot see the trigger. A split deployment resolves this, because the agent pods stay up while the inference tier goes to zero. If the model runs inside the agent container, source the signal from an always-on exporter: a KEDA Redis, Kafka, or RabbitMQ scaler on queue length, or Knative for request-driven activation, not from the workload it is trying to wake.
Eviction storms.
Aggressive scale-down with a misconfigured
`PodDisruptionBudget`
can cascade into evictions that drop tasks. Tune budgets, the stabilization window, and graceful termination together.
Spot interruptions.
Workloads on Spot GPUs get reclaimed on roughly two minutes’ notice; checkpoint on
`SIGTERM`
or keep stateful workloads on on-demand capacity.
Gang scheduling.
Multi-GPU workloads that must start together can deadlock when the default scheduler places them partially. A queueing layer such as Kueue or a batch scheduler such as Volcano fills this gap.
Always-on vs scale-to-zero vs inference-aware
The right point depends on your latency SLO and traffic shape. The cost and latency columns below are measured on our fleet, which means they describe one GPU deployment; read them per deployment and sum across the fleet.
Approach
Avg running GPUs
Idle GPU cost
First-task latency after idle
Always-on (fixed 3)
3.0 (24/7)
Pays idle ~77% of the time
Instant (always warm)
Inference-aware + warm
(KEDA min=1)
2.17 under continuous bursts; 1.0 on true idle
Warm floor only
Bounded — warm workload serves immediately
Scale-to-zero
(KEDA min=0)
0 when idle
None ($0 idle)
~3.2 min cold start
The warm-mode 2.17 average reflects
continuous
6-minute bursts fighting a 5-minute stabilization window; with genuine idle windows (nights, weekends) it drops to one, and with predictive models it drops further without the latency risk. And GPU sharing is an orthogonal lever that applies to every row: whatever your scaling posture, fractionalizing the accelerator lowers the cost of each replica you do run.
When always-on is actually the right call
To be fair to the default: always-on is correct for some workloads. If you have a hard, strict latency SLO with no tolerance for a warm-up tail, and traffic is steady and high enough that duty cycle is already near saturation, the idle cost is small and the simplicity of fixed replicas is worth it. A shared inference tier fronting a large agent fleet is frequently this case, and consolidating agents onto one well-loaded inference deployment is itself the first optimization worth making, because it is what raises duty cycle to the point where always-on stops being wasteful.
So measure duty cycle per GPU deployment, count how many deployments the stack actually contains, and choose deliberately. Our fleet sat at 23.5%. A consolidated tier will sit higher, and a routing model nobody thought about will sit far lower. The data for your fleet should make that call, not this article.
Methodology
The promise at the top was that every number came from a live run, so here is how it was produced and measured.
The cluster.
A GKE cluster of three NVIDIA T4 GPUs, one per
`n1-standard-8`
node. The cost basis is GCP on-demand for that instance, about $0.73 per node-hour, which is where the ~$525 per node and ~$1,576/month for the fleet come from. Nothing about the setup is exotic. It is the shape most interactive agent fleets already run.
The workload.
A synthetic agent standing in for the real thing: a resident model footprint that holds VRAM for the life of the pod, driven by a queue that fires GPU bursts. Bursts arrive roughly every six minutes and last seconds, which is what puts a ~6-minute arrival pattern against the HPA’s 5-minute scale-down window and produces the reactive-scaling result in the latency section. The synthetic shape lets the burst cadence, memory footprint, and queue depth be set deliberately instead of waiting on production traffic.
Stated limitation: topology.
The synthetic workload holds its model footprint in the same container as the agent logic, with no inference server in front of it and therefore no pre-allocated KV cache, so every measurement describes a single-tenant deployment where the weights are the entire GPU memory footprint. That arrangement is real, and it appears in per-tenant fine-tuned models, small local models used for routing or embedding, sandboxed agent runtimes where the pod is the isolation boundary, and air-gapped deployments. It is not the majority arrangement. What transfers unchanged to a split deployment: the CPU-blind Horizontal Pod Autoscaler result, both cold-start measurements, the entire scaling-loop latency analysis, failure mode 1, and the container rightsizing figures. What does not transfer: the 23.5% duty cycle read as a fleet-wide idle proportion, and the GPU memory rightsizing figure read as advice for a tuned vLLM server. Both are qualified at the point of use.
The measurement.
GPU metrics come from the NVIDIA DCGM per-pod exporter scraped into Prometheus. Duty cycle is the fraction of time
`DCGM_FI_DEV_GPU_UTIL`
for the pod sat above 10%, measured over 24 hours, which came out at 23.5%. Average utilization (21.8%) and burst saturation (100%) are read from the same series. Reading utilization and memory together, rather than either alone, is what separates a busy card from a full one.
What “applied” means.
The after numbers are not projections. ScaleOps ran under its production policy, and container requests were changed through Kubernetes in-place pod resize, so the fleet converged while tasks kept running, with no restart. The recovered capacity counts only what frees allocatable resources on the node. Capacity held by workloads that cannot be evicted or restarted stays in the reserved column, so the figures are what you could actually reclaim, not a theoretical maximum.
FAQs
Frequently Asked Questions
How much does idle GPU capacity behind an agent fleet cost?
Reserved minus active GPU-hours, times your GPU hourly rate, summed across every GPU deployment serving your agents. On our single-tenant fleet, three T4s at ~$1,576/month running a 23.5% duty cycle meant roughly $1,200/month idle. A well-loaded shared inference tier shows a much smaller idle share, so the fleet total depends on how many separate GPU deployments you run and the duty cycle of each.
Do AI agents need their own GPU?
Usually not. The agent process is orchestration logic and is typically CPU-only, while the GPU sits in a separate inference deployment serving many agents. Giving each agent its own accelerator makes GPU count scale with agent count and defeats the continuous batching that makes inference efficient. Loading the model inside the agent container is justified in narrower cases: per-tenant fine-tuned models, small local models for routing or embedding, and sandboxed runtimes where the pod is the isolation boundary.
Can you scale AI inference to zero on Kubernetes?
Yes, with KEDA, which supports scale-to-zero that plain horizontal pod autoscaling does not. Two catches. There is a cold start of about 3.2 minutes on the next request, which a warm floor bounds. And the scaling metric cannot be published by the workload being scaled, because at zero replicas nothing publishes it. A split deployment solves this because the agent pods stay up; otherwise, source the signal from an always-on exporter.
Can multiple models share one GPU?
Yes, through time-slicing or MPS (software sharing, soft isolation), MIG (hardware-isolated slices on Ampere-generation GPUs and newer), or Dynamic Resource Allocation (scheduler-aware and fine-grained, GA and on by default from Kubernetes 1.34). The best candidates are small models that cannot fill a card on their own: routers, classifiers, embedding models, re-rankers. A tuned vLLM server already using its VRAM for KV cache is a poor candidate.
Why can’t I just rightsize the GPU?
On a tuned inference server you should not, because its VRAM headroom is pre-allocated KV cache and cutting it reduces batch size and concurrency. The levers there are replica count for idle capacity and cold-start reduction for the latency that scaling introduces. GPU memory rightsizing applies where the agent loads the weights itself, with no serving layer pre-allocating a cache, and to small models with real slack. Container CPU and memory is almost always over-padded and is the safest thing to rightsize first: ours went from 4 cores and 24 GiB to 1117m and 282 MiB.
Achieve Full GPU Utilization
Cut GPU costs by 70%
Maximize model performance
Free your engineers
Book a Demo
Related Articles
DRA Keeps Its Promises. Nothing Checks What You Actually Used.
Nic Vermandé
Sep 26, 2026
Kubernetes DRA enforces allocation at scheduling time and nothing else. Three gaps follow: enforcement, attribution,…
Read more >>
GPUs in Kubernetes: How It Actually Works Under the Hood
Nic Vermandé
Jul 20, 2026
GPUs in Kubernetes are the most expensive line item in almost every AI infrastructure budget,…
Read more >>
Book a Demo
Schedule your demo
Submit the form and schedule your 1:1 demo with a ScaleOps platform expert.
Schedule your demo
Submit the form and schedule your 1:1 demo with a ScaleOps platform expert.
Meet ScaleOps at Booth #900
Schedule your 1:1 demo with a ScaleOps platform expert.
<strong>Start Optimizing K8s Resources in Minutes!</strong>
Schedule your 1:1 demo with a ScaleOps expert and start your free trial today.
Schedule your demo
Submit the form and schedule your 1:1 demo with a ScaleOps platform expert.
Schedule your demo
Submit the form and schedule your 1:1 demo with a ScaleOps platform expert.