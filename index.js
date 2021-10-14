/**
 * Copyright 2021 ziggurat-project/actions-dco contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// This script is inspired by probot/dco with modifications to adopt GitHub Actions.

/**
 * ISC License
 *
 * Copyright (c) [probot/dco contributors](https://github.com/probot/dco/graphs/contributors)
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

const core = require('@actions/core');
const github = require('@actions/github');
const validator = require('email-validator');

function getDCOStatus(commits, prURL) {
    const failed = []

    for (const { commit, author, parents, sha } of commits) {
      const isMerge = parents && parents.length > 1
      if (isMerge) {
        continue
      } else if (author && author.type === 'Bot') {
        continue
      }

      const commitInfo = {
        sha,
        url: `${prURL}/commits/${sha}`,
        author: commit.author.name,
        committer: commit.committer.name,
        message: ''
      }

      const signoffs = getSignoffs(commit)

      if (signoffs.length === 0) {
        // no signoffs found
        commitInfo.message = 'The sign-off is missing.'
        failed.push(commitInfo)
        continue
      }

      const email = commit.author.email || commit.committer.email
      if (!(validator.validate(email))) {
        commitInfo.message = `${email} is not a valid email address.`
        failed.push(commitInfo)
        continue
      }

      const authors = [commit.author.name.toLowerCase(), commit.committer.name.toLowerCase()]
      const emails = [commit.author.email.toLowerCase(), commit.committer.email.toLowerCase()]
      if (signoffs.length === 1) {
        // commit contains one signoff
        const sig = signoffs[0]
        if (!(authors.includes(sig.name.toLowerCase())) || !(emails.includes(sig.email.toLowerCase()))) {
          commitInfo.message = `Expected "${commit.author.name} <${commit.author.email}>", but got "${sig.name} <${sig.email}>".`
          failed.push(commitInfo)
        }
      } else {
        // commit contains multiple signoffs
        const valid = signoffs.filter(
          signoff => authors.includes(signoff.name.toLowerCase()) && emails.includes(signoff.email.toLowerCase())
        )

        if (valid.length === 0) {
          const got = signoffs.map(sig => `"${sig.name} <${sig.email}>"`).join(', ')
          commitInfo.message = `Can not find "${commit.author.name} <${commit.author.email}>", in [${got}].`
          failed.push(commitInfo)
        }
      } // end if
    } // end for
    return failed
  }

function getSignoffs (commit) {
    const regex = /^Signed-off-by: (.*) <(.*)>$/img
    const matches = []
    let match
    while ((match = regex.exec(commit.message)) !== null) {
        matches.push({
            name: match[1],
            email: match[2]
        })
    }

    return matches
}

function handleOneCommit (pr) {
    return `You only have one commit incorrectly signed off! To fix, first ensure you have a local copy of your branch by [checking out the pull request locally via command line](https://help.github.com/en/github/collaborating-with-issues-and-pull-requests/checking-out-pull-requests-locally). Next, head to your local branch and run: \n\`\`\`bash\ngit commit --amend --no-edit --signoff\n\`\`\`\nNow your commits will have your sign off. Next run \n\`\`\`bash\ngit push --force-with-lease origin ${pr.head.ref}\n\`\`\``
}

function handleMultipleCommits (pr, commitLength, dcoFailed) {
    return `You have ${dcoFailed.length} commits incorrectly signed off. To fix, first ensure you have a local copy of your branch by [checking out the pull request locally via command line](https://help.github.com/en/github/collaborating-with-issues-and-pull-requests/checking-out-pull-requests-locally). Next, head to your local branch and run: \n\`\`\`bash\ngit rebase HEAD~${commitLength} --signoff\n\`\`\`\n Now your commits will have your sign off. Next run \n\`\`\`bash\ngit push --force-with-lease origin ${pr.head.ref}\n\`\`\``
}

async function check() {
    const repoToken = core.getInput('repo-token');
    const client = github.getOctokit(repoToken)

    const base = github.context.payload.pull_request.base.sha;
    const head = github.context.payload.pull_request.head.sha;

    const result = await client.rest.repos.compareCommitsWithBasehead({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        basehead: `${base}...${head}`
    });

    if (!result) {
        throw new Error(`cannot get commits ${base}...${head} - not found.`);
    }

    if (result.status != 200) {
        throw new Error(`cannot get commits ${base}...${head} - ${result.status}.`);
    }

    const commits = result.data.commits;
    const dcoFailed = getDCOStatus(commits, github.context.payload.pull_request.html_url);

    if (dcoFailed.length) {
        let summary = []
        dcoFailed.forEach(function (commit) {
            summary.push(
            `Commit sha: [${commit.sha.substr(0, 7)}](${commit.url}), Author: ${
                commit.author
            }, Committer: ${commit.committer}; ${commit.message}`
            )
        })
        summary = summary.join('\n')
        if (dcoFailed.length === 1) {
            summary = handleOneCommit(github.context.payload.pull_request) + `\n\n${summary}`
        } else {
            summary =
            handleMultipleCommits(github.context.payload.pull_request, commits.length, dcoFailed) +
            `\n\n${summary}`
        }

        throw new Error(summary);
    }

    return
}

check().then(() => {
    process.exit();
}).catch(error => {
    core.setFailed(error.message);
});
