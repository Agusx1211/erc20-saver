import "./App.css"

import React, { Component } from "react"
import { withStyles } from "@material-ui/styles"
import ApprovalsPage from "../components/ApprovalsPage"

const styles = theme => ({
  content: {
    maxWidth: 970,
    margin: "auto",
    marginBottom: 110
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
    return (<>
      <div className={classes.content}>
        <ApprovalsPage></ApprovalsPage>
      </div>
    </>
    )
  }
}

export default withStyles(styles)(App)
