import React, { useState, useEffect } from "react"

import { useWeb3React } from "../../hooks"
import { ERC20_META_ABI } from "../../constants/MetaERC20"
import { ERC721_META_ABI } from "../../constants/MetaERC721"
import { WYVERN_PROXY_REGISTRY_ABI } from "../../constants/WyvernProxyRegistry"

import PROJECTS from "../../constants/Projects"
import { findProject } from "../../context/projects"
import { amountFormatter, getContract } from "../../utils"
import { useTransactionAdder, useStatusRemoval, REMOVE_STATUS } from '../../contexts/Transactions'
import Web3Status from "../../components/Web3Status"

import Web3 from "web3"
import { ethers } from "ethers"
import { aggregate } from "@makerdao/multicall"
import Typography from "@material-ui/core/Typography"

import { makeStyles } from "@material-ui/core/styles"
import Card from "@material-ui/core/Card"
import CardHeader from "@material-ui/core/CardHeader"
import CardActions from "@material-ui/core/CardActions"
import Avatar from "@material-ui/core/Avatar"
import Collapse from "@material-ui/core/Collapse"
import Button from "@material-ui/core/Button"
import { Grid } from "@input-output-hk/react-grid"
import CircularProgress from '@material-ui/core/CircularProgress'
import CheckIcon from '@material-ui/icons/Check'

import styled from "styled-components"

import './styles.css'

const HeaderElement = styled.div`
  min-width: 0;
  align-items: center;
`

const HeaderFrame = styled.div`
  display: flex;
  margin-top: 3.5rem;
  align-items: center;
  justify-content: space-between;
  width: 100%;
`

const RPC_URL = process.env.REACT_APP_NETWORK_URL
const TOKEN_TYPES = {
  ERC20: "ERC20",
  ERC721: "ERC721"
}

const APPROVAL_TYPE = {
  ERC20_APPROVE: 0,
  ERC721_APPROVE: 1,
  ERC721_APPROVAL_FOR_ALL: 2
}

const readWeb3 = new Web3(RPC_URL)

const multicallConfig = {
  multicallAddress: "0xeefba1e63905ef1d7acba5a8513c70307c1ce441",
  rpcUrl: RPC_URL
}

function b(number) {
  return ethers.utils.bigNumberify(number)
}

async function getAllApproved(account) {
  function onlyUnique(value, index, self) {
    return self.indexOf(value) === index
  }

  const logs = await readWeb3.eth.getPastLogs({
    fromBlock: 0,
    toBlock: "latest",
    topics: [
      "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925", // Approve topic
      `0x000000000000000000000000${account.replace("0x", "")}` // Account topic
    ]
  })

  let out = []
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i]
    if (!out.find(o => o.token === log.address)) {
      const obj = {
        token: log.address,
        tokenType: TOKEN_TYPES.ERC20,
        approvalType: APPROVAL_TYPE.ERC20_APPROVE,
        data: readWeb3.utils.toHex(log.data),
        approves: logs
          .filter(l => l.address === log.address)
          .map(l => l.topics[2].replace("0x000000000000000000000000", "0x"))
          .filter(onlyUnique)
      }

      out.push(obj)
    }
  }

  return out
}

async function realApproves(account, obj) {
  let result
  try {
    result = await aggregate(
      obj.approves
        .map(addr => {
          return {
            target: obj.token,
            call: ["allowance(address,address)(uint256)", account, addr],
            returns: [[`${obj.token}-${addr}`]]
          }
        })
        .concat([
          {
            target: obj.token,
            call: ["balanceOf(address)(uint256)", account],
            returns: [[`b`]]
          },
          {
            target: obj.token,
            call: ["decimals()(uint8)"],
            returns: [[`d`]]
          },
          {
            target: obj.token,
            call: ["totalSupply()(uint256)"],
            returns: [[`t`]]
          }
        ]),
      multicallConfig
    )
  } catch (e) {
    // Fallback: could be an ERC721 Approve
    return null
  }

  if (
    obj.token.toLowerCase() === "0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359"
  ) {
    obj.symbol = "SAI"
    obj.name = "SAI Stablecoin (old DAI)"
  } else if (
    obj.token.toLowerCase() === "0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2"
  ) {
    obj.symbol = "MKR"
    obj.name = "Maker DAO"
  } else {
    let metaContract = await new readWeb3.eth.Contract(ERC20_META_ABI, obj.token)

    const namePromise = metaContract.methods.name().call()
    const symbolPromise = metaContract.methods.symbol().call()

    try {
      obj.symbol = await symbolPromise
    } catch {
      obj.symbol = "???"
    }

    try {
      obj.name = await namePromise
    } catch {
      if (obj.symbol !== "???") {
        obj.name = obj.symbol
      } else {
        obj.name = "Unknown Token"
      }
    }
  }

  obj.totalSupply = b(result.results["t"].toString())
  obj.decimals = b(result.results["d"].toString())

  let out = []
  for (var key in result.results) {
    if (key === "b") {
      try {
        obj.balance = b(result.results[key].toString())
        obj.balanceFormated = amountFormatter(obj.balance, obj.decimals)
      } catch {
        obj.balanceFormated = "???"
      }
    } else if (key.includes("-")) {
      const amount = b(result.results[key].toString())
      let formated

      if (amount.gt(b(0))) {
        if (amount.gt(obj.totalSupply)) {
          formated = `Unlimited ${obj.symbol}`
        } else {
          formated = `${amountFormatter(amount, obj.decimals, 3, true)} ${
            obj.symbol
            }`
        }

        const addr = key.replace(`${obj.token}-`, "")
        out.push({
          addr: addr,
          amount: amount,
          formated: formated,
          project: findProject(addr)
        })
      }
    }
  }

  obj.logo = `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${readWeb3.utils.toChecksumAddress(
    obj.token
  )}/logo.png`

  obj.real = out
  return obj
}

async function getApprovalsForAll(account) {
  const logs = await readWeb3.eth.getPastLogs({
    fromBlock: 0,
    toBlock: "latest",
    topics: [
      "0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31", // ApprovalForAll topic
      `0x000000000000000000000000${account.replace("0x", "")}` // Account topic
    ]
  })

  let out = []
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i]

    if (!out.find(o => o.token === log.address)) {
      const obj = {
        token: log.address,
        tokenType: TOKEN_TYPES.ERC721,
        approvalType: APPROVAL_TYPE.ERC721_APPROVAL_FOR_ALL
      }

      let approves = []
      for (let i = 0; i < logs.length; i++) {
        const log = logs[i]
        if (obj.token === log.address) {
          const isApproved = readWeb3.utils.toDecimal(log.data) === 1

          const operator = log.topics[2].replace(
            "0x000000000000000000000000",
            "0x"
          )

          if (isApproved && !approves.find(a => a === operator)) {
            approves.push(operator)
          } else if (!isApproved && approves.find(a => a === operator)) {
            approves = approves.filter(a => a === operator)
          }
        }
      }
      obj.approves = approves
      out.push(obj)
    }
  }

  return out
}

async function realApprovalsForAll(account, obj) {
  const metaContract = await new readWeb3.eth.Contract(ERC721_META_ABI, obj.token)

  const namePromise = metaContract.methods.name().call()
  const symbolPromise = metaContract.methods.symbol().call()
  const balancePromise = metaContract.methods.balanceOf(account).call()

  try {
    obj.symbol = await symbolPromise
  } catch {
    obj.symbol = "???"
  }

  try {
    obj.name = await namePromise
  } catch {
    if (obj.symbol !== "???") {
      obj.name = obj.symbol
    } else {
      obj.name = "Unknown Token"
    }
  }

  try {
    obj.balance = (await balancePromise).toString()
    obj.balanceFormated = obj.balance
  } catch {
    // do nothing
  }

  let out = []
  for (let addr of obj.approves) {
    const metaContract = await new readWeb3.eth.Contract(ERC721_META_ABI, addr)
    const namePromise = PROJECTS[addr.toLowerCase()]
      ? PROJECTS[addr.toLowerCase()]
      : metaContract.methods.name().call()

    let name

    try {
      name = await namePromise
    } catch {
      name = addr
      // Check for proxy used for OpenSea
      const wyvernProxy = await new readWeb3.eth.Contract(
        WYVERN_PROXY_REGISTRY_ABI,
        "0xa5409ec958c83c3f309868babaca7c86dcb077c1"
      )
      try {
        const proxyAddress = await wyvernProxy.methods.proxies(account).call()
        if (proxyAddress.toLowerCase() === addr.toLowerCase()) {
          name = "Wyber Proxy Registry"
        }
      } catch (e) {
        console.log(e.message)
      }
    }

    out.push({
      addr: addr,
      project: { title: name }
    })
  }

  obj.logo = `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${readWeb3.utils.toChecksumAddress(
    obj.token
  )}/logo.png`

  obj.real = out
  return obj
}

const INITIAL_STATE = {
  pending: [],
  all: [],
  loaded: false
}

function ApprovalsPage() {
  const { account } = useWeb3React()
  const [state, setState] = useState(INITIAL_STATE)

  useEffect(() => {
    async function fetch() {
      if (account && account !== undefined) {
        const approvals = await getAllApproved(account)
        const approvalsForAll = await getApprovalsForAll(account)

        setState({
          ...INITIAL_STATE,
          pending: [...approvals, ...approvalsForAll],
          loaded: true
        })
      }
    }
    fetch()
  }, [account])

  useEffect(() => {
    async function fetch() {
      if (account && account !== undefined && state.pending.length !== 0) {
        const cpending = state.pending.slice()
        const call = state.all.slice()
        const token = cpending.shift()
        let retrieve

        switch (token.approvalType) {
          case APPROVAL_TYPE.ERC20_APPROVE:
            retrieve = await realApproves(account, token)
            break
          case APPROVAL_TYPE.ERC721_APPROVAL_FOR_ALL:
            retrieve = await realApprovalsForAll(account, token)
            break
          default:
            break
        }

        if (retrieve) {
          call.push(retrieve)
        }

        setState({
          all: call,
          pending: cpending,
          loaded: true
        })
      }
    }
    fetch()
  }, [state.pending.length, account, state])

  let total = 0
  state.all.forEach(t => t.real.forEach(() => total++))

  return (
    <>
      <div className={account && "main"}>
        <div className={account ? "header" : "startScreen"}>
          <div className={account ? "headerBody" : "headerBodyStart"}>
            <HeaderElement>
              <Typography variant="h3" style={{ wordBreak: "break-word" }} gutterBottom>
                Token allowances
            </Typography>
              {!account && <div style={{ maxWidth: "600px", wordBreak: "break-word" }}>
                Most dApps require you to "approve" a token before start using them; those approvals never expire, and those contracts (sometimes) can access your funds without your explicit permission.
            <br /><br />
                This dApp allows you to see all contracts that currently have access to your tokens, and remove those permissions.
            </div>}
            </HeaderElement>
            <HeaderElement style={account && { marginBottom: "auto" }}>
              <div className={!account && "web3status"}><Web3Status /></div>
            </HeaderElement>
          </div>
          {account && <Typography style={{ wordBreak: "break-word", fontSize: "1em" }} gutterBottom>for address {account}</Typography>}
          {state.all.map((item) => <TokenSection key={`t1-${item.token}`} data={{ item: item }} />)}
          <div className="messageStyle">
            {(account && state.loaded && total === 0 && state.pending.length === 0) && <>
              This address didn't approve any contract 🔒
          </>}
            {(account && (!state.loaded || state.pending.length !== 0)) && <>
              Loading ...
          </>}
          </div>
        </div>
        {(account && <footer className="credits">
          Made with love by <a href="https://twitter.com/Agusx1211" target="_blank" rel="noopener noreferrer">Agus</a> and <a href="https://twitter.com/nachomazzara" target="_blank" rel="noopener noreferrer">Nacho</a>
        </footer>)}
      </div>
    </>
  )
}

const useStyles = makeStyles(() => ({
  title: {
    fontSize: 14,
  },
}))

function TokenSection(props) {
  const item = props.data.item

  const type = item.approvalType === APPROVAL_TYPE.ERC20_APPROVE ? TOKEN_TYPES.ERC20 : TOKEN_TYPES.ERC721

  if (item.real.length === 0) {
    return <></>
  }

  return (
    <div>
      <div>
        <HeaderFrame>
          <HeaderElement>
            <div className="tokenTitle">{item.symbol}</div>
            {item.symbol !== item.name && (
              <div className="tokenName">
                {item.name.toString()}
              </div>
            )}
          </HeaderElement>
          <HeaderElement>
            <span style={{ color: "#c9c9c9", textAlign: "right" }}>
              <div className="tokenTitle">{type}</div>
              <div className="tokenName">
                {item.balance ? `${item.balanceFormated} ${item.symbol}` : 'No balance'}
              </div>
            </span>
          </HeaderElement>
        </HeaderFrame>
      </div>
      <Grid
        cellHeight={180}
        sm={1}
        md={1}
        xl={2}
        style={{
          display: "flex",
          flexWrap: "wrap",
          width: "100%",
          marginTop: "12px"
        }}
      >{
          item.real.map(entry => {
            return (
              <div className="cards-row" key={`l1-${entry.addr}-${item.token}`}>
                <AllowanceCard
                  data={{ item: item, entry: entry }}
                ></AllowanceCard>
              </div>
            )
          })}
      </Grid>
    </div>
  )
}

function AllowanceCard(props) {
  // Declare a new state variable, which we'll call "count"
  const [expanded, setExpanded] = React.useState(false)

  const handleExpandClick = () => {
    setExpanded(!expanded)
  }

  const classes = useStyles()

  const item = props.data.item
  const obj = props.data.entry

  const handleViewClick = () => {
    openInNewTab(`https://etherscan.io/address/${obj.addr}#code`)
    return false
  }

  const { library, account } = useWeb3React()
  const addTransaction = useTransactionAdder()
  const id = `${account}${obj.addr}${item.token}`

  const statusRemoval = useStatusRemoval(id)

  const handleRevoke = async () => {
    const { addr } = obj

    let metaContract
    let tx

    switch (item.tokenType) {
      case TOKEN_TYPES.ERC20:
        metaContract = getContract(item.token, ERC20_META_ABI, library, account)
        if (
          addr.toLowerCase() ===
          "0xB8c77482e45F1F44dE1745F52C74426C631bDD52".toLowerCase()
        ) {
          // BNB
          tx = await metaContract.approve(addr, 1)
        } else {
          tx = await metaContract.approve(addr, 0)
        }
        break
      case TOKEN_TYPES.ERC721:
        metaContract = getContract(item.token, ERC721_META_ABI, library, account)
        tx = await metaContract.setApprovalForAll(addr, false)
        break
      default:
        break
    }

    addTransaction(tx, { id: id })
  }

  return (
    <div>
      <Card className={"cardme"} onClick={handleExpandClick}>
        {statusRemoval === REMOVE_STATUS.DONE && <>
          <Typography className="cardTitle" color="textSecondary" gutterBottom>
            {obj.project ? obj.project.title : "Unknown project"}
          </Typography>
          <CardHeader
            avatar={<CheckIcon />}
            title="Removed"
            subheader={obj.addr}
          />
        </>
        }
        {statusRemoval === REMOVE_STATUS.PENDING && <>
          <Typography className={classes.title} color="textSecondary" gutterBottom>
            {obj.project ? obj.project.title : "Unknown project"}
          </Typography>
          <CardHeader
            avatar={
              <CircularProgress />
            }
            title="Removing..."
            subheader={obj.addr}
          />
        </>
        }
        {statusRemoval === REMOVE_STATUS.NONE && <>
          <Typography className={classes.title} color="textSecondary" gutterBottom>
            {obj.project ? obj.project.title : "Unknown project"}
          </Typography>
          <CardHeader
            avatar={
              <Avatar
                alt={item.symbol}
                src={item.logo}
              />
            }
            title={`${obj.formated || "All tokens"}`}
            subheader={obj.addr}
          />
          <Collapse in={expanded} timeout="auto" unmountOnExit>
            <CardActions>
              <Button onClick={handleViewClick} size="small" color="primary">
                View
          </Button>
              <Button size="small" color="primary" onClick={handleRevoke}>
                Revoke
          </Button>
            </CardActions>
          </Collapse>
        </>}
      </Card>
    </div>
  )
}

function openInNewTab(url) {
  var win = window.open(url, "_blank")
  win.focus()
}

export default ApprovalsPage
