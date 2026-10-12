---
title: Idle shutdown  |  Gemini Enterprise Agent Platform  |  Google Cloud Documentation
id: idle-shutdown-gemini-enterprise-agent-platform-google-cloud-documentation
tags:
- ai-software-factory-architecture-58e4cc
- idle-shutdown
- auto-termination
- cost-management
created: '2026-10-12T08:31:38.903190Z'
updated: '2026-10-12T08:33:20.496553Z'
source: https://docs.cloud.google.com/gemini-enterprise-agent-platform/notebooks/workbench/instances/idle-shutdown
source_domain: docs.cloud.google.com
fetched_at: '2026-10-12T08:31:38.898804Z'
fetch_provider: builtin
status: draft
type: note
tier: ground_truth
content_type: docs
deprecated: false
summary: 'Google Cloud''s Gemini Enterprise Agent Platform Workbench documentation
  on infra-level idle shutdown: Workbench instances (notebook/agent execution VMs)
  auto-shut-down after a configurable period of inactivity (default 180 minutes, range
  10-1440 min in console, any integer seconds via idle-timeout-seconds metadata key
  or Terraform). Activity is defined narrowly as kernel activity on 127.0.0.1:8080/api/{sessions,terminals,kernels}
  -- CPU usage alone does NOT reset the timer, so a compute-bound but interaction-idle
  instance will still be killed. Billing stops for CPU/GPU while shut down (disk storage
  charges persist). Scheduled executions still run on schedule even while the instance
  is in a shut-down state, implying the platform treats ''shut down'' as a dormant/resumable
  state rather than destroyed. This is infra-level (VM lifecycle) auto-termination
  rather than an agent-logic self-termination decision, but it is the mechanism a
  software-factory architecture would layer agent-level ''quiet self-terminate on
  clean health check'' logic on top of.'
---

Idle shutdown  |  Gemini Enterprise Agent Platform  |  Google Cloud Documentation
Skip to main content
/
Console
English
Deutsch
Español – América Latina
Français
Indonesia
Italiano
Português – Brasil
עברית
中文 – 简体
中文 – 繁體
日本語
한국어
Sign in
Gemini Enterprise Agent Platform
Start free
Home
Documentation
AI and ML
Gemini Enterprise Agent Platform
Notebooks
Send feedback
Idle shutdown
Stay organized with collections
Save and categorize content based on your preferences.
Gemini Enterprise Agent Platform Workbench instances
shut down after a specified period of inactivity by default.
This page describes the idle shutdown feature and how to
change the default idle shutdown settings during instance creation.
Overview
To help manage costs, Agent Platform Workbench instances
shut down after being idle for a specific time period by default.
You can change the amount of time or turn this feature off.
Requirements for running idle shutdown
For idle shutdown to run, your Agent Platform Workbench instance
must have guest attributes enabled. Guest attributes are enabled by default
but if you've turned off guest attributes, you can enable guest attributes
by setting the
`enable-guest-attributes`
metadata key to
`true`
. See
Update an instance's metadata
.
Billing
While your instance is shut down, there are no CPU or GPU
usage charges except for scheduled executions that run during
the shutdown. For more information about scheduled executions, see
Scheduled executions run while instance is shut down
on this page.
Disk storage charges still apply while
your instance is shut down. For more information,
see
Pricing
.
Turn off idle shutdown or change the default inactivity time period
Idle shutdown is enabled and set to shut down your instance after
180 inactive minutes by default.
You can change these settings when you
create an instance
.
To turn off idle shutdown or to change the inactivity time period
on an existing instance:
In the Google Cloud console, go to the
Instances
page.
Go to Instances
Click the instance name.
On the
Instance details
page, click the
Software and security
tab.
In the
Modify software and security configuration
section:
To turn off idle shutdown, clear the check mark next to
Enable Idle Shutdown
.
To change the inactivity time period,
in
Time of inactivity before shutdown (Minutes)
, change
the number to the number of minutes of inactivity that you want.
In the Google Cloud console, this setting
can be set to any integer value from 10 to 1440.
Click
Submit
.
Manage idle shutdown using the gcloud CLI
Idle shutdown for Agent Platform Workbench instances is managed using
the
`metadata`
flag. To enable idle shutdown,
create an instance with the
`idle-timeout-seconds`
key in the metadata
with the value set to the number of seconds.
```
gcloud workbench instances create INSTANCE_NAME --metadata=idle-timeout-seconds=86400
```
To change the idle shutdown time period, update the value for the
`idle-timeout-seconds`
key in the metadata.
```
gcloud workbench instances update INSTANCE_NAME --metadata=idle-timeout-seconds=43200
```
To turn off idle shutdown, use the following command:
```
gcloud workbench instances update INSTANCE_NAME --metadata=idle-timeout-seconds=
```
Manage idle shutdown on Terraform
Idle shutdown for workbench instances on Terraform is managed using the
`idle-timeout-seconds`
key in the metadata field.
To learn how to apply or remove a Terraform configuration, see
Basic Terraform commands
.
```
resource "google_workbench_instance" "default" {
  name     = "workbench-instance-example"
  location = "us-central1-a"

  gce_setup {
    machine_type = "n1-standard-1"
    vm_image {
      project = "cloud-notebooks-managed"
      family  = "workbench-instances"
    }
    metadata = {
      idle-timeout-seconds = "10800"
    }
  }
}
```
How idle shutdown works
Your instance shuts down when there is no kernel activity for the
specified time period. For example, running a cell or new output printing
to a notebook is activity that resets the idle shutdown timer. CPU usage
doesn't reset the idle shutdown timer.
If you leave JupyterLab open and you don't interact with the window,
the instance will shut down after the idle shutdown period.
By default, idle shutdown looks for activity in kernels running in
the following addresses of the instance:
`127.0.0.1:8080/api/sessions`
`127.0.0.1:8080/api/terminals`
`127.0.0.1:8080/api/kernels`
Scheduled executions run while instance is shut down
If you have scheduled an execution of a notebook file
in a Agent Platform Workbench instance that is shut down,
the execution still runs on schedule.
What's next
To run a notebook file on a schedule, even when your instance is shut down,
see
schedule a notebook
run
.
Send feedback
Except as otherwise noted, the content of this page is licensed under the
Creative Commons Attribution 4.0 License
, and code samples are licensed under the
Apache 2.0 License
. For details, see the
Google Developers Site Policies
. Java is a registered trademark of Oracle and/or its affiliates.
Last updated 2026-10-09 UTC.