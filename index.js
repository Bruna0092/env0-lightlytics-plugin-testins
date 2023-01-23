import minimist from 'minimist'
import {publish, poll, getMarkdownComment} from 'lightlytics-publisher-core'
import Table from 'cli-table3'
import colors from '@colors/colors'

const pollTimeoutDefault = 10 // minutes
const pollIntervalDefault = 5000

try {
  const args = minimist(process.argv.slice(2))

  if (args['help'] || args['h']) {
    throw "Expected usage: node index.js --dir=\"./working-dir\" --hostname=\"./api-Url\" --plan=\"./working-dir/plan.json\" --graph=\"./working-dir/graph.dot\" --token=\"collection-token\""
  }

  const requiredArgs = ['dir', 'hostname', 'graph', 'token']

  if (Object.keys(args).length <= requiredArgs.length) {
    throw `Expected at least ${requiredArgs.length} cli arguments. usage: node index.js --dir=\"./working-dir\" --hostname="./api-Url\" --plan=\"./working-dir/plan.json\" --graph=\"./working-dir/graph.dot\" --token=\"collection-token\"`
  }

  requiredArgs.forEach(requiredArg => {
    if (!args[requiredArg]) {
      throw `Missing arg - \"${requiredArg}\" usage: node index.js --${requiredArg}=value. try --help if needed`
    }
  })

  const tfWorkingDir = args['dir']
  const apiUrl = args['hostname']
  const tfPlan = args['plan']
  const tfcToken = args['tfc-token']
  const tfcRunId = args['tfc-run-id']
  const tfGraph = args['graph']
  const collectionToken = args['token']
  const metadata = {source: {format: 'Terraform'}}
  const optionalMetadataArgs = ['name', 'type', 'format', 'branch', 'base_branch', 'commit_hash', 'pr_id', 'repository', 'user_name']
  optionalMetadataArgs.map(arg => {
    if (args[arg]) {
      metadata['source'][arg] = args[arg]
    }
  })

  const {eventId, customerId} = await publish({
    apiUrl,
    tfWorkingDir,
    tfPlan,
    tfcToken,
    tfcRunId,
    tfGraph,
    collectionToken,
    metadata
  })

  if (args['poll']) {
    await poll({
      apiUrl,
      collectionToken,
      customerId,
      eventId,
      pollTimeout: args['pollTimeout'] ? Number(args['pollTimeout']) : pollTimeoutDefault,
      pollInterval: args['pollInterval'] ? Number(args['pollInterval']) : pollIntervalDefault,
      onStatusUpdate: (status, violations) => {
        if (status.conclusion) {
          const details_url = `https://${apiUrl}/w/${customerId}/simulations/${eventId}`

          args['markdown'] ?
            console.log(getMarkdownComment(status, violations, details_url)) :
            printCLI(status, violations, details_url)

          if (status.conclusion !== 'success') {
            process.exit(1)
          }
        }
      }
    })
  } else {
    logFormattedSimulation(`https://${apiUrl}/w/${customerId}/simulations/${eventId}`)
  }
} catch (error) {
  console.error(error)
}

function logFormattedSimulation(link) {
  const pullRequestMessage = `An execution simulation has been generated by **Lightlytics**, to view this run impact analysis, Visit:
${link}

> _This comment was added automatically by a git workflow to help DevOps teams predict what will be the impact of the proposed change after completing this PR_`

  console.log(pullRequestMessage)
}

function printCLI(status, violations = [], details_url) {
  const violationsTable = new Table({
    head: ['Severity', 'Category', 'Violation', 'Count']
  })

  const formatViolation = violation =>
    [`${severityToColorCLI(violation.severity)}${violation.fail_simulation ? '*' : ''}`, violation.category, violation.name, violation.count]

  let forceFailCount = 0

  for (const violation of violations) {
    if (violation.fail_simulation) forceFailCount++

    violationsTable.push(formatViolation(violation))
  }

  console.log(`An execution simulation has been generated by Lightlytics:\n${details_url}`)
  console.log(`Simulation Status: ${statusToColorCLI(status.label)}\n`)
  console.log(`Total violations count: ${violations.length}`)
  console.log(`Forced failed violations: ${forceFailCount}`)

  if (violations) {
    console.log('Violation Summary:')
    console.log(violationsTable.toString())

    if (forceFailCount) {
      console.log('* Violation that is forcing the simulation to fail')
    }
  }
}

function severityToColorCLI(severity) {
  switch (severity) {
    case 4:
      return colors.red('Critical')
    case 3:
      return colors.red('High')
    case 2:
      return colors.yellow('Medium')
    case 1:
      return colors.gray('Low')
  }

  return severity
}

function statusToColorCLI(statusLabel) {
  switch (statusLabel) {
    case 'Errored':
      return colors.red(statusLabel)
    case 'Failed':
      return colors.red(statusLabel)
    case 'Passed':
      return colors.green(statusLabel)
  }
  return statusLabel
}
