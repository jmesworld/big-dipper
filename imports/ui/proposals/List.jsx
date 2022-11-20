import React, { Component } from 'react';
import { Table, Spinner } from 'reactstrap';
import { Link } from 'react-router-dom';
import { ProposalStatusIcon } from '../components/Icons.jsx';
import i18n from 'meteor/universe:i18n';
import TimeStamp from '../components/TimeStamp.jsx';
import { SubmitProposalButton } from '../ledger/LedgerActions.jsx';
import voca from 'voca';
import { cutTrailingZeroes, separateDecimals, separateFractions } from '../../../both/utils/regex-formatting.js';
import Tooltip from "react-simple-tooltip";

const T = i18n.createComponent();

const ProposalRow = (props) => {
    
    return <tr>
        <th className="d-none d-sm-table-cell counter">{props.proposal.proposalId}</th>
        <td className="title"><Link to={"/proposals/"+props.proposal.proposalId}>{props.proposal.content.title}</Link></td>
        <td className="status"><ProposalStatusIcon status={props.proposal.status}/><span className="d-none d-sm-inline"> {voca.chain(props.proposal.status.substr(16)).replace('_', ' ').titleCase().value()}</span></td>
        <td className="submit-block"><TimeStamp time={props.proposal.submit_time}/></td>
        <td className="voting-start">{(props.proposal.voting_start_time != "0001-01-01T00:00:00Z")?<TimeStamp time={props.proposal.voting_start_time}/>:'Not started'}</td>
        <td style={{overflow: 'visible'}} className="deposit text-right">{props.proposal.total_deposit?props.proposal.total_deposit.map((deposit, i) => {
            const amountToDisplay = cutTrailingZeroes(separateDecimals(separateFractions(deposit.amount)));
            const amountToDisplayLength = amountToDisplay.length;
            const maxLengthToDisplay = 11;

            if (amountToDisplayLength > maxLengthToDisplay) {
                const toolTip = amountToDisplay;
                const formattedAmount = amountToDisplay.slice(0, 6) + '...' + amountToDisplay.slice(-2);
                return<div key={i}>
                            <Tooltip
                                padding='5'
                                content={toolTip}
                                background="#9c27b0"
                                border="#9c27b0"
                                offset='1'
                                style={{overflow: 'visible'}}
                                placement='left'>
                                {formattedAmount}
                            </Tooltip> JMES
                        </div>
            } else {
                return <div key={i}>{amountToDisplay} JMES</div>
            }
        }):'0'}</td>
    </tr>
}

export default class List extends Component{
    constructor(props){
        super(props);
        if (Meteor.isServer){
            if (this.props.proposals.length > 0){
                this.state = {
                    proposals: this.props.proposals.map((proposal, i) => {
                        return <ProposalRow key={i} index={i} proposal={proposal} />
                    })
                }
            }
        }
        else{
            this.state = {
                proposals: null
            }
        }
    }

    static getDerivedStateFromProps(props, state) {
        if (state.user !== localStorage.getItem(CURRENTUSERADDR)) {
            return {user: localStorage.getItem(CURRENTUSERADDR)};
        }
        return null;
    }

    componentDidUpdate(prevState){
        if (this.props.proposals != prevState.proposals){
            if (this.props.proposals.length > 0){
                this.setState({
                    proposals: this.props.proposals.map((proposal, i) => {
                        return <ProposalRow key={i} index={i} proposal={proposal} />
                    })
                })
            }
        }
    }

    render(){
        if (this.props.loading){
            return <Spinner type="grow" color="primary" />
        }
        else{
            return (
                <div>
                    {this.state.user?<SubmitProposalButton history={this.props.history}/>:null}
                    <Table striped className="proposal-list">
                        <thead>
                            <tr>
                                <th className="d-none d-sm-table-cell counter"><i className="fas fa-hashtag"></i> <T>proposals.proposalId</T></th>
                                <th className="title"><i className="material-icons">view_headline</i> <span className="d-none d-sm-inline"><T>proposals.title</T></span></th>
                                <th className="status"><i className="fas fa-toggle-on"></i> <span className="d-none d-sm-inline"><T>proposals.status</T></span></th>
                                <th className="submit-block"><i className="fas fa-box"></i> <span className="d-none d-sm-inline"><T>proposals.submitTime</T> (UTC)</span></th>
                                <th className="voting-start"><i className="fas fa-box-open"></i> <span className="d-none d-sm-inline"><T>proposals.votingStartTime</T> (UTC)</span></th>
                                <th className="deposit text-right"><i className="material-icons">attach_money</i> <span className="d-none d-sm-inline"><T>proposals.totalDeposit</T></span></th>
                            </tr>
                        </thead>
                        <tbody>{this.state.proposals}</tbody>
                    </Table>
                </div>
            )
        }
    }
}