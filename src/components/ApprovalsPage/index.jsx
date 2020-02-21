import React, { useState, useEffect } from 'react'

import { useWeb3React } from '../../hooks'
import { ERC20_META_ABI } from '../../constants/MetaERC20';
import { findProject } from '../../context/projects';
import { amountFormatter } from '../../utils';
import Web3Status from '../../components/Web3Status'

import Web3 from 'web3';
import { ethers } from 'ethers'
import { aggregate } from '@makerdao/multicall';
import Typography from '@material-ui/core/Typography';
import { withStyles } from '@material-ui/styles';

import { makeStyles } from '@material-ui/core/styles';
import Card from '@material-ui/core/Card';
import CardHeader from '@material-ui/core/CardHeader';
import CardActions from '@material-ui/core/CardActions';
import Avatar from '@material-ui/core/Avatar';
import Collapse from '@material-ui/core/Collapse';
import Button from '@material-ui/core/Button';
import { Grid, Row } from '@input-output-hk/react-grid'
import GridListTile from '@material-ui/core/GridListTile';

import styled from 'styled-components'

const HeaderElement = styled.div`
  min-width: 0;
  align-items: center;`

const HeaderFrame = styled.div`
  display: flex;
  margin-top: 3.5rem;
  align-items: center;
  justify-content: space-between;
  width: 100%;`

const RPC_URL = process.env.REACT_APP_NETWORK_URL;
const web3 = new Web3(RPC_URL);

const multicallConfig = {
  multicallAddress: '0xeefba1e63905ef1d7acba5a8513c70307c1ce441',
  rpcUrl: RPC_URL
};

function b (number) {
  return ethers.utils.bigNumberify(number);
}

async function getAllApproved(account) {
  function onlyUnique(value, index, self) { 
    return self.indexOf(value) === index;
  }
  console.log("LOADING LOGS")
  const logs = await web3.eth.getPastLogs({
    fromBlock: 0,
    toBlock: 'latest',
    // address: tokens,
    topics: [
      "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925", // Approve topic
      `0x000000000000000000000000${account.replace('0x', '')}`              // Account topic
    ]
  });
  console.log(logs)
  let out = [];
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    if (!out.find((o) => o.token === log.address)) {
      const obj = {
        token: log.address,
        approves: logs
          .filter((l) => l.address === log.address)
          .map((l) => l.topics[2].replace('0x000000000000000000000000', '0x'))
          .filter(onlyUnique)
      }

      out.push(obj);
    }
  }

  return out;
}

async function realApproves(account, obj) {
  let result = await aggregate(
    obj.approves.map((addr) => {
    return {
      target: obj.token,
      call: ['allowance(address,address)(uint256)', account, addr],
      returns: [[`${obj.token}-${addr}`]]
    }}).concat([
      {
        target: obj.token,
        call: ['balanceOf(address)(uint256)', account],
        returns: [[`b`]]
      },
      {
        target: obj.token,
        call: ['decimals()(uint8)'],
        returns: [[`d`]]
      },
      {
        target: obj.token,
        call: ['totalSupply()(uint256)'],
        returns: [[`t`]]
      }
    ]),
    multicallConfig
  );

  if (obj.token.toLowerCase() === '0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359') {
    obj.symbol = 'SAI';
    obj.name = 'SAI Stablecoin (old DAI)';
  } else if (obj.token.toLowerCase() === '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2') {
    obj.symbol = 'MKR';
    obj.name = 'Maker DAO';
  } else {
    let metaContract = await new web3.eth.Contract(ERC20_META_ABI, obj.token );

    const namePromise = metaContract.methods.name().call();
    const symbolPromise = metaContract.methods.symbol().call();

    try {
      obj.symbol = await symbolPromise;
    } catch {
      obj.symbol = '???';
    }

    try {
      obj.name = await namePromise;
    } catch {
      if (obj.symbol !== '???') {
        obj.name = obj.symbol;
      } else {
        obj.name = 'Unknown Token';
      }
    }
  }

  obj.totalSupply = b(result.results['t'].toString());
  obj.decimals = b(result.results['d'].toString());

  let out = []
  for (var key in result.results) {
    if (key === 'b') {
      obj.balance = b(result.results[key].toString());
    } else if (key.includes('-')) {
      const amount = b(result.results[key].toString());
      let formated;

      if (amount.gt(b(0))) {
        if (amount.gt(obj.totalSupply)) {
          formated = `Unlimited ${obj.symbol}`;
        } else {
          formated = `${amountFormatter(amount, obj.decimals, 3, true)} ${obj.symbol}`;
        }

        const addr = key.replace(`${obj.token}-`, '');
        out.push({
          addr: addr,
          amount: amount,
          formated: formated,
          project: findProject(addr)
        });
      }
    }
  }

  obj.logo = `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${
    web3.utils.toChecksumAddress(obj.token)
  }/logo.png`;

  obj.real = out;
  return obj;
}

const INITIAL_STATE = {
  pending: [],
  all: []
}

function ApprovalsPage() {
    const { account } = useWeb3React()
    const [state, setState] = useState(INITIAL_STATE)

    console.log(account)
    useEffect(() => {
      async function fetch() {
        if (account !== undefined) {
          const all = await getAllApproved(account)
          setState({
            ...INITIAL_STATE,
            pending: all
          })
        }
      }
      fetch();
    }, [account]);

    useEffect(() => {
      async function fetch() {
        if (account !== undefined && state.pending.length !== 0) {
          const cpending = state.pending.slice()
          const call = state.all.slice()
          const token = cpending.shift()
          const retrieve = await realApproves(account, token);
          call.push(retrieve)
          setState({
            all: call,
            pending: cpending
          })
        }
      }
      fetch();
    }, [state.pending.length, account, state])
  
    console.log("Real approves", state)
    return (
    <>
    <HeaderFrame>
    <HeaderElement>
      <Typography variant="h3" gutterBottom>
        ERC20 Allowances
      </Typography>
      <Typography gutterBottom>
        for address {account}
      </Typography>
      </HeaderElement>
      <HeaderElement>
        <Web3Status/>
      </HeaderElement>
    </HeaderFrame>
      {
      state.all.map((item) => {
        return item.real.length > 0 && <div key={`t1-${item.token}`}>
          <div style={{marginTop:45, marginLeft: 10}}>
            <Typography variant="h4">
              {item.symbol}
            </Typography>
            {item.symbol !== item.name &&
            <Typography variant="h6" gutterBottom>
              {item.name.toString()}
            </Typography>
            }
          </div>
          <Grid cellHeight={180} cols={2}>
          <Row spacing={1} columnSpacing={0.5} sm={1} md={1} xl={2}>
          {
            item.real.map((entry) => {
              return (
                <GridListTile key={`l1-${entry.addr}-${item.token}`} cols={1} style={{ height: 'auto' }}>
                  <AllowanceCard data={{item: item, entry: entry}}></AllowanceCard>
                </GridListTile>
              )
            })
          }
          </Row>
        </Grid>
        </div>
      })
    }
    </>
    )
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

const useStyles2 = makeStyles(theme => ({
  content: {
    maxWidth: 950,
    margin: 'auto'
  },
  card: {
    width: 410,
    // minHeight: 120,
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
  },
  expand: {
    // transform: 'rotate(0deg)',
    // marginLeft: 'auto',
    // transition: theme.transitions.create('transform', {
    //   duration: theme.transitions.duration.shortest,
    // }),
  },
  avatar: {
  },
}));

function AllowanceCard(props) {
  // Declare a new state variable, which we'll call "count"
  const [expanded, setExpanded] = React.useState(false);

  const handleExpandClick = () => {
    setExpanded(!expanded);
  };

  const classes = useStyles2();

  const token = props.data.item;
  const obj = props.data.entry;

  const handleViewClick = () => {
    openInNewTab(`https://etherscan.io/address/${obj.addr}#code`);
    return false;
  };

  return (
    <Card className={classes.card}>
    <Typography className={classes.title} color="textSecondary" gutterBottom>
      {obj.project ? obj.project.title : 'Unknown project'}
    </Typography>
    <CardHeader onClick={handleExpandClick}
      avatar={
        <Avatar alt={token.symbol} src={token.logo} className={classes.avatar}/>
      }
      title={`${obj.formated}`}
      subheader={obj.addr} 
    />
    <Collapse in={expanded} timeout="auto" unmountOnExit>
      <CardActions>
        <Button onClick={handleViewClick} size="small" color="primary">
          View
        </Button>
        <Button size="small" color="primary">
          Revoke
        </Button>
      </CardActions>
    </Collapse>
    </Card>
  );
}

function openInNewTab(url) {
  var win = window.open(url, '_blank');
  win.focus();
}

export default withStyles(styles)(ApprovalsPage);
