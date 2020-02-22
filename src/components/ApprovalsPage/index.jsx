import React, { useState, useEffect } from "react";

import { useWeb3React } from "../../hooks";
import { ERC20_META_ABI } from "../../constants/MetaERC20";
import { ERC721_META_ABI } from "../../constants/MetaERC721";
import { WYVERN_PROXY_REGISTRY_ABI } from "../../constants/WyvernProxyRegistry";

import PROJECTS from "../../constants/Projects";
import { findProject } from "../../context/projects";
import { amountFormatter } from "../../utils";
import Web3Status from "../../components/Web3Status";

import Web3 from "web3";
import { ethers } from "ethers";
import { aggregate } from "@makerdao/multicall";
import Typography from "@material-ui/core/Typography";
import { withStyles } from "@material-ui/styles";

import { makeStyles } from "@material-ui/core/styles";
import Card from "@material-ui/core/Card";
import CardHeader from "@material-ui/core/CardHeader";
import CardActions from "@material-ui/core/CardActions";
import Avatar from "@material-ui/core/Avatar";
import Collapse from "@material-ui/core/Collapse";
import Button from "@material-ui/core/Button";
import { Grid, Row } from "@input-output-hk/react-grid";
import GridListTile from "@material-ui/core/GridListTile";

import styled from "styled-components";

const HeaderElement = styled.div`
  min-width: 0;
  align-items: center;
`;

const HeaderFrame = styled.div`
  display: flex;
  margin-top: 3.5rem;
  align-items: center;
  justify-content: space-between;
  width: 100%;
`;

const RPC_URL = process.env.REACT_APP_NETWORK_URL;
const TOKEN_TYPES = {
  ERC20: "erc20",
  ERC721: "erc721"
};

const APPROVAL_TYPE = {
  ERC20_APPROVE: 0,
  ERC721_APPROVE: 1,
  ERC721_APPROVAL_FOR_ALL: 2
};

var web3 = new Web3(window.ethereum);

const multicallConfig = {
  multicallAddress: "0xeefba1e63905ef1d7acba5a8513c70307c1ce441",
  rpcUrl: RPC_URL
};

function b(number) {
  return ethers.utils.bigNumberify(number);
}

async function getAllApproved(account) {
  function onlyUnique(value, index, self) {
    return self.indexOf(value) === index;
  }
  console.log("LOADING LOGS");
  const logs = await web3.eth.getPastLogs({
    fromBlock: 0,
    toBlock: "latest",
    topics: [
      "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925", // Approve topic
      `0x000000000000000000000000${account.replace("0x", "")}` // Account topic
    ]
  });

  let out = [];
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    if (!out.find(o => o.token === log.address)) {
      const obj = {
        token: log.address,
        tokenType: TOKEN_TYPES.ERC20,
        approvalType: APPROVAL_TYPE.ERC20_APPROVE,
        data: web3.utils.toHex(log.data),
        approves: logs
          .filter(l => l.address === log.address)
          .map(l => l.topics[2].replace("0x000000000000000000000000", "0x"))
          .filter(onlyUnique)
      };

      out.push(obj);
    }
  }

  return out;
}

async function realApproves(account, obj) {
  let result;
  try {
    result = await aggregate(
      obj.approves
        .map(addr => {
          return {
            target: obj.token,
            call: ["allowance(address,address)(uint256)", account, addr],
            returns: [[`${obj.token}-${addr}`]]
          };
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
    );
  } catch (e) {
    // Fallback: could be an ERC721 Approve
    return null;
  }

  if (
    obj.token.toLowerCase() === "0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359"
  ) {
    obj.symbol = "SAI";
    obj.name = "SAI Stablecoin (old DAI)";
  } else if (
    obj.token.toLowerCase() === "0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2"
  ) {
    obj.symbol = "MKR";
    obj.name = "Maker DAO";
  } else {
    let metaContract = await new web3.eth.Contract(ERC20_META_ABI, obj.token);

    const namePromise = metaContract.methods.name().call();
    const symbolPromise = metaContract.methods.symbol().call();

    try {
      obj.symbol = await symbolPromise;
    } catch {
      obj.symbol = "???";
    }

    try {
      obj.name = await namePromise;
    } catch {
      if (obj.symbol !== "???") {
        obj.name = obj.symbol;
      } else {
        obj.name = "Unknown Token";
      }
    }
  }

  obj.totalSupply = b(result.results["t"].toString());
  obj.decimals = b(result.results["d"].toString());

  let out = [];
  for (var key in result.results) {
    if (key === "b") {
      obj.balance = b(result.results[key].toString());
    } else if (key.includes("-")) {
      const amount = b(result.results[key].toString());
      let formated;

      if (amount.gt(b(0))) {
        if (amount.gt(obj.totalSupply)) {
          formated = `Unlimited ${obj.symbol}`;
        } else {
          formated = `${amountFormatter(amount, obj.decimals, 3, true)} ${
            obj.symbol
          }`;
        }

        const addr = key.replace(`${obj.token}-`, "");
        out.push({
          addr: addr,
          amount: amount,
          formated: formated,
          project: findProject(addr)
        });
      }
    }
  }

  obj.logo = `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${web3.utils.toChecksumAddress(
    obj.token
  )}/logo.png`;

  obj.real = out;
  return obj;
}

async function getApprovalsForAll(account) {
  const logs = await web3.eth.getPastLogs({
    fromBlock: 0,
    toBlock: "latest",
    topics: [
      "0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31", // ApprovalForAll topic
      `0x000000000000000000000000${account.replace("0x", "")}` // Account topic
    ]
  });

  let out = [];
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];

    if (!out.find(o => o.token === log.address)) {
      const obj = {
        token: log.address,
        tokenType: TOKEN_TYPES.ERC721,
        approvalType: APPROVAL_TYPE.ERC721_APPROVAL_FOR_ALL
      };

      let approves = [];
      for (let i = 0; i < logs.length; i++) {
        const log = logs[i];
        if (obj.token === log.address) {
          const isApproved = web3.utils.toDecimal(log.data) === 1;

          const operator = log.topics[2].replace(
            "0x000000000000000000000000",
            "0x"
          );

          if (isApproved && !approves.find(a => a === operator)) {
            approves.push(operator);
          } else if (!isApproved && approves.find(a => a === operator)) {
            approves = approves.filter(a => a === operator);
          }
        }
      }
      obj.approves = approves;
      out.push(obj);
    }
  }

  return out;
}

async function realApprovalsForAll(obj) {
  const metaContract = await new web3.eth.Contract(ERC721_META_ABI, obj.token);

  const namePromise = metaContract.methods.name().call();
  const symbolPromise = metaContract.methods.symbol().call();

  try {
    obj.symbol = await symbolPromise;
  } catch {
    obj.symbol = "???";
  }

  try {
    obj.name = await namePromise;
  } catch {
    if (obj.symbol !== "???") {
      obj.name = obj.symbol;
    } else {
      obj.name = "Unknown Token";
    }
  }

  let out = [];
  for (let addr of obj.approves) {
    const metaContract = await new web3.eth.Contract(ERC721_META_ABI, addr);
    const namePromise = PROJECTS[addr.toLowerCase()]
      ? PROJECTS[addr.toLowerCase()]
      : metaContract.methods.name().call();

    let name;

    try {
      name = await namePromise;
    } catch {
      name = addr;
      // Check for proxy used for OpenSea
      const wyvernProxy = await new web3.eth.Contract(
        WYVERN_PROXY_REGISTRY_ABI,
        "0xa5409ec958c83c3f309868babaca7c86dcb077c1"
      );
      const account = (await web3.eth.getAccounts())[0];
      try {
        const proxyAddress = await wyvernProxy.methods.proxies(account).call();
        if (proxyAddress.toLowerCase() === addr.toLowerCase()) {
          name = "Wyber Proxy Registry";
        }
      } catch (e) {
        console.log(e.message);
      }
    }

    out.push({
      addr: addr,
      project: { title: name }
    });
  }

  obj.logo = `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${web3.utils.toChecksumAddress(
    obj.token
  )}/logo.png`;

  obj.real = out;
  return obj;
}

const INITIAL_STATE = {
  pending: [],
  all: []
};

function ApprovalsPage() {
  const { account } = useWeb3React();
  const [state, setState] = useState(INITIAL_STATE);

  useEffect(() => {
    async function fetch() {
      if (account !== undefined) {
        const approvals = await getAllApproved(account);
        const approvalsForAll = await getApprovalsForAll(account);

        setState({
          ...INITIAL_STATE,
          pending: [...approvals, ...approvalsForAll]
        });
      }
    }
    fetch();
  }, [account]);

  useEffect(() => {
    async function fetch() {
      if (account !== undefined && state.pending.length !== 0) {
        const cpending = state.pending.slice();
        const call = state.all.slice();
        const token = cpending.shift();
        let retrieve;

        switch (token.approvalType) {
          case APPROVAL_TYPE.ERC20_APPROVE:
            retrieve = await realApproves(account, token);
            break;
          case APPROVAL_TYPE.ERC721_APPROVAL_FOR_ALL:
            retrieve = await realApprovalsForAll(token);
            break;
          default:
            break;
        }

        if (retrieve) {
          call.push(retrieve);
          setState({
            all: call,
            pending: cpending
          });
        }
      }
    }
    fetch();
  }, [state.pending.length, account, state]);

  // const erc20Approves = state.all
  //   ? state.all.filter(a => a.approvalType === APPROVAL_TYPE.ERC20_APPROVE)
  //   : [];

  // const erc721ApprovalForAlls = state.all
  //   ? state.all.filter(
  //       a => a.approvalType === APPROVAL_TYPE.ERC721_APPROVAL_FOR_ALL
  //     )
  //   : [];

  return (
    <>
      <HeaderFrame>
        <HeaderElement>
          <Typography variant="h3" gutterBottom>
            Token allowances
          </Typography>
          {account && <Typography gutterBottom>for address {account}</Typography>}
        </HeaderElement>
        <HeaderElement>
          <Web3Status />
        </HeaderElement>
      </HeaderFrame>
      {state.all.map((item) => <TokenSection data={{item: item}}/>)}
    </>
  );
}
const styles = theme => ({
  content: {
    maxWidth: 950,
    margin: 'auto',
    marginBottom: 110
  },
  title: {
    fontSize: 14,
  },
  pos: {
    marginBottom: 12,
  },
  gridList: {
    width: 950,
  },
});

const useStyles2 = makeStyles(() => ({
  content: {
    maxWidth: 950,
    margin: 'auto'
  },
  card: {
    width: 430,
    margin: 12,
    padding: 12
  },
  title: {
    fontSize: 14,
  },
  pos: {
    marginBottom: 12,
  },
  gridList: {
    width: 950,
  }
}));

function TokenSection(props) {
  const item = props.data.item;
  const type = item.type === APPROVAL_TYPE.APPROVAL_TYPE_ERC20 ? "ERC20" : "ERC721";
  return (
    <div key={`t1-${item.token}`}>
      <div style={{ marginTop: 45, marginLeft: 10 }}>
      <HeaderFrame>
        <HeaderElement>
        <Typography variant="h4">{item.symbol}</Typography>
        </HeaderElement>
        <HeaderElement>
        <Typography variant="h4"><span style={{ color: "#c9c9c9" }}>{type}</span></Typography>
        </HeaderElement>
        </HeaderFrame>
        {item.symbol !== item.name && (
          <Typography variant="h6" gutterBottom>
            {item.name.toString()}
          </Typography>
        )}
      </div>
      <Grid
        cellHeight={180}
        sm={1}
        md={1}
        xl={2}
        style={{
          display: "flex",
          flexWrap: "wrap",
          width: "100%"
        }}
      >{
        item.real.map(entry => {
          return (
            // <GridListTile
            //   key={`l1-${entry.addr}-${item.token}`}
            //   cols={1}
            //   style={{ height: "auto" }}
            // >
            <div>
              <AllowanceCard key={`l1-${entry.addr}-${item.token}`}
                data={{ item: item, entry: entry }}
              ></AllowanceCard>
            </div>
            // </GridListTile>
          );
        })}
      </Grid>
    </div>
  )
}

function AllowanceCard(props) {
  // Declare a new state variable, which we'll call "count"
  const [expanded, setExpanded] = React.useState(false);

  const handleExpandClick = () => {
    setExpanded(!expanded);
  };

  const classes = useStyles2();

  const item = props.data.item;
  const obj = props.data.entry;

  const handleViewClick = () => {
    openInNewTab(`https://etherscan.io/address/${obj.addr}#code`);
    return false;
  };

  const handleRevoke = async () => {
    const from = (await web3.eth.getAccounts())[0];
    const { addr } = obj;

    let metaContract;

    switch (item.tokenType) {
      case TOKEN_TYPES.ERC20:
        metaContract = await new web3.eth.Contract(ERC20_META_ABI, item.token);
        if (
          addr.toLowerCase() ===
          "0xB8c77482e45F1F44dE1745F52C74426C631bDD52".toLowerCase()
        ) {
          // BNB
          await metaContract.methods.approve(addr, 1).send({ from });
        } else {
          await metaContract.methods.approve(addr, 0).send({ from });
        }
        break;
      case TOKEN_TYPES.ERC721:
        metaContract = await new web3.eth.Contract(ERC721_META_ABI, item.token);
        await metaContract.methods
          .setApprovalForAll(addr, false)
          .send({ from });
        break;
      default:
        console.log("Unknown type");
        break;
    }
  };

  return (
    <Card className={classes.card}>
      <Typography className={classes.title} color="textSecondary" gutterBottom>
        {obj.project ? obj.project.title : "Unknown project"}
      </Typography>
      <CardHeader
        onClick={handleExpandClick}
        avatar={
          <Avatar
            alt={item.symbol}
            src={item.logo}
            className={classes.avatar}
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
    </Card>
  );
}

function openInNewTab(url) {
  var win = window.open(url, "_blank");
  win.focus();
}

export default withStyles(styles)(ApprovalsPage);
