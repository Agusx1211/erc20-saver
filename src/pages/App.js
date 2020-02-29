import "./App.css"

import React, { Component } from "react"
import { withStyles } from "@material-ui/styles"
import ApprovalsPage from "../components/ApprovalsPage"
import Web3ReactManager from '../components/Web3ReactManager'

const styles = theme => ({
  content: {
    maxWidth: 970,
    margin: "auto",
    // marginBottom: 110,
  },
  title: {
    fontSize: 14
  },
  pos: {
    marginBottom: 12
  },
  gridList: {
    width: 970
  }
})

class App extends Component {
  render() {
    const { classes } = this.props
    return (
      <Web3ReactManager>
        <div className={classes.content}>
          <ApprovalsPage></ApprovalsPage>
        </div>
      </Web3ReactManager>
    )
  }
}

export default withStyles(styles)(App)
